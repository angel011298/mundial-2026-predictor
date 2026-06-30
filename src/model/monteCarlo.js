/**
 * monteCarlo.js — Motor probabilístico del Simulador Monte Carlo
 * ─────────────────────────────────────────────────────────────────
 * Expone las primitivas del simulador:
 *   mulberry32          — PRNG sembrable y determinista (alias: makeRng)
 *   samplePoisson       — muestreador Knuth (≠ PMF de dixonColes.js)
 *   deriveLambdas       — λ del partido: DC base + tilt Elo
 *   sampleMatch         — un resultado completo {gh, ga}
 *   simulateGroupMatch  — partido de grupos: usa resultado real si está disponible
 *   simulateGroup       — round-robin + desempate FIFA → clasificación [1º..4º]
 *   rankBestThirds          — top-8 de los 12 terceros (Pts→GD→GF→sorteo)
 *   simulateKnockoutMatch   — partido eliminatorio: 90min → ET → penales
 *   fillBracket             — crea los 31 KnockoutNodes desde el template
 *   simulateBracket         — recorre R32→R16→QF→SF→F y devuelve el campeón
 *   runTournamentSimulation — N iteraciones completas con agregación en streaming
 *
 * Diseño documentado en docs/montecarlo.md.
 */

import { formMultiplier, LEAGUE_AVG } from './dixonColes.js';
import { HOST_CODES, HOME_ADV_ELO }   from './elo.js';
import SHOOTOUT_RATES                  from '../data/shootoutRates.json';

// ─── Constantes calibrables ──────────────────────────────────────
/**
 * Peso del ajuste Elo sobre λ (ver §3.1 de docs/montecarlo.md).
 * Valor provisional; se añade a la lista de parámetros de scripts/backtest.mjs.
 * TODO: calibrar en Fase 3 histórica.
 */
export const GAMMA = 0.15;

/** Factores de localía (alineados con dixonColes.js) */
const HOST_ADV_FACTOR = 1.12; // ~12% más goles para sedes USA/CAN/MEX
const ELO_DIVISOR     = 400;

// ─── Utilidades ──────────────────────────────────────────────────
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ─── RNG sembrable (mulberry32) ──────────────────────────────────
/**
 * Devuelve una función de aleatoriedad uniforme [0, 1) determinista.
 * Dos instancias con la misma seed producen la misma secuencia.
 * PRNG puro: no toca Math.random() ni estado global.
 *
 * @param {number} seed  Entero de 32 bits
 * @returns {() => number}
 */
export function mulberry32(seed) {
  let s = seed >>> 0; // asegurar uint32
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Alias histórico usado en docs/montecarlo.md y fases MC-2+. */
export const makeRng = mulberry32;

// ─── Muestreador Poisson (Knuth) ─────────────────────────────────
/**
 * Muestrea k ~ Poisson(lambda) usando el algoritmo de Knuth.
 * Distinto del `poisson(lambda, k)` de dixonColes.js, que es la PMF.
 *
 * @param {number}   lambda  Tasa esperada de goles (> 0)
 * @param {Function} rng     PRNG de makeRng
 * @returns {number} Entero ≥ 0 (tope defensivo en 12)
 */
export function samplePoisson(lambda, rng) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return Math.min(k - 1, 12);
}

// ─── Derivación de λ (DC + tilt Elo) ────────────────────────────
/**
 * Calcula [lambdaHome, lambdaAway] para un partido hipotético.
 *
 * Estructura del objeto de equipo (TeamStrength):
 *   { code, attack, defense, elo, form, avgGF?, avgGA? }
 *   attack / defense son multiplicadores relativos al promedio (1.0 = liga).
 *   Fallbacks si ausentes: attack=defense=1.0, elo=1500, form=''.
 *
 * @param {object} H   Equipo local
 * @param {object} A   Equipo visitante
 * @param {object} ctx Contexto adicional (reservado para extensiones)
 * @returns {[number, number]}  [lamH, lamA] clampeados a [0.15, 6]
 */
export function deriveLambdas(H, A, ctx = {}) {
  const codeH = H.code ?? '';

  // Ventaja de localía: solo para sedes del torneo
  const homeAdv = HOST_CODES.has(codeH) ? HOST_ADV_FACTOR : 1.0;

  // Modificadores de forma (rango 0.82–1.18, ver dixonColes.js)
  const fmH = formMultiplier(H.form ?? '');
  const fmA = formMultiplier(A.form ?? '');

  // Fuerzas relativas al promedio (fallback: equipo promedio)
  const atH  = H.attack  ?? 1.0;
  const defA = A.defense ?? 1.0;
  const atA  = A.attack  ?? 1.0;
  const defH = H.defense ?? 1.0;

  // Base Dixon-Coles (misma estructura que dixonColesProbs)
  let lamH = atH * defA * LEAGUE_AVG * homeAdv * fmH;
  let lamA = atA * defH * LEAGUE_AVG            * fmA;

  // Tilt Elo: desplaza goles hacia el favorito Elo conservando el total aproximado.
  // homeAdv ya aplicado en lamH, por eso se añade HOME_ADV_ELO solo si es sede.
  const eloH   = H.elo ?? 1500;
  const eloA   = A.elo ?? 1500;
  const eloAdv = HOST_CODES.has(codeH) ? HOME_ADV_ELO : 0;
  const eloDiff = (eloH - eloA) + eloAdv;
  const tilt    = Math.exp(GAMMA * eloDiff / ELO_DIVISOR);
  lamH *= Math.sqrt(tilt);
  lamA /= Math.sqrt(tilt);

  return [clamp(lamH, 0.15, 6), clamp(lamA, 0.15, 6)];
}

// ─── Muestra un partido ──────────────────────────────────────────
/**
 * Resuelve un partido: samplea goles con Poisson para cada equipo.
 *
 * @param {object}   H    Equipo local (TeamStrength)
 * @param {object}   A    Equipo visitante (TeamStrength)
 * @param {object}   ctx  Contexto (reservado)
 * @param {Function} rng  PRNG de makeRng
 * @returns {{ gh: number, ga: number }}
 */
export function sampleMatch(H, A, ctx, rng) {
  const [lamH, lamA] = deriveLambdas(H, A, ctx);
  return {
    gh: samplePoisson(lamH, rng),
    ga: samplePoisson(lamA, rng),
  };
}

// ═══════════════════════════════════════════════════════════════════
// MC-2 — Fase de grupos: round-robin + desempates FIFA
// ═══════════════════════════════════════════════════════════════════

// Todos los pares (índice local, índice visitante) de un grupo de 4
const GROUP_FIXTURES = [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]];

// Clave dirigida para playedResults: "${homeCode}:${awayCode}"
// El orden coincide con GROUP_FIXTURES — el consumidor usa el mismo orden.
function matchKey(hCode, aCode) { return `${hCode}:${aCode}`; }

function initStat(team, groupId) {
  return { team, group: groupId, P:0, W:0, D:0, L:0, GF:0, GA:0, GD:0, Pts:0 };
}

// Comparador global: Pts DESC → GD DESC → GF DESC
function cmpGlobal(a, b) {
  return (b.Pts - a.Pts) || (b.GD - a.GD) || (b.GF - a.GF);
}

// Fisher-Yates in-place con el RNG sembrado (determinista)
function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Estadísticas head-to-head entre los equipos del bloque
function computeH2H(block, matchLog) {
  const codes = new Set(block.map(s => s.team.code));
  const h2h = new Map(block.map(s => [s.team.code, { Pts:0, GF:0, GA:0, GD:0 }]));
  for (const { home, away, gh, ga } of matchLog) {
    if (!codes.has(home) || !codes.has(away)) continue;
    const h = h2h.get(home);
    const a = h2h.get(away);
    h.GF += gh; h.GA += ga; h.GD += gh - ga;
    a.GF += ga; a.GA += gh; a.GD += ga - gh;
    if      (gh > ga) h.Pts += 3;
    else if (gh === ga) { h.Pts++; a.Pts++; }
    else  a.Pts += 3;
  }
  return h2h;
}

// Resuelve un bloque de equipos empatados: H2H → sub-bloques → sorteo RNG
function resolveBlock(block, matchLog, rng) {
  if (block.length === 1) return block;

  const h2h = computeH2H(block, matchLog);

  const sorted = [...block].sort((a, b) => {
    const ha = h2h.get(a.team.code);
    const hb = h2h.get(b.team.code);
    return (hb.Pts - ha.Pts) || (hb.GD - ha.GD) || (hb.GF - ha.GF);
  });

  const result = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    const ref = h2h.get(sorted[i].team.code);
    while (j < sorted.length) {
      const cur = h2h.get(sorted[j].team.code);
      if (cur.Pts === ref.Pts && cur.GD === ref.GD && cur.GF === ref.GF) j++;
      else break;
    }
    const sub = sorted.slice(i, j);
    if (sub.length > 1) shuffleInPlace(sub, rng);
    result.push(...sub);
    i = j;
  }
  return result;
}

// Orden final del grupo aplicando el cascade FIFA completo
function rankGroup(statsList, matchLog, rng) {
  statsList.sort(cmpGlobal);
  const result = [];
  let i = 0;
  while (i < statsList.length) {
    let j = i + 1;
    const ref = statsList[i];
    while (j < statsList.length) {
      const cur = statsList[j];
      if (cur.Pts === ref.Pts && cur.GD === ref.GD && cur.GF === ref.GF) j++;
      else break;
    }
    result.push(...resolveBlock(statsList.slice(i, j), matchLog, rng));
    i = j;
  }
  return result;
}

/**
 * Simula (o recupera el resultado real de) un partido de fase de grupos.
 *
 * @param {object}   home          Equipo local (TeamStrength: {code,...})
 * @param {object}   away          Equipo visitante
 * @param {Function} rng           PRNG de mulberry32
 * @param {Map<string,{gh:number,ga:number}>} [playedResults]
 *   Clave: `${homeCode}:${awayCode}` en el mismo orden que GROUP_FIXTURES.
 *   Cuando la clave está presente se usa el marcador real (condicionamiento §4.2).
 * @returns {{ gh: number, ga: number, fromReal: boolean }}
 */
export function simulateGroupMatch(home, away, rng, playedResults) {
  const key = matchKey(home.code, away.code);
  if (playedResults?.has(key)) {
    const { gh, ga } = playedResults.get(key);
    return { gh, ga, fromReal: true };
  }
  const { gh, ga } = sampleMatch(home, away, {}, rng);
  return { gh, ga, fromReal: false };
}

/**
 * Simula el round-robin de un grupo de 4 equipos y devuelve la tabla ordenada
 * aplicando el cascade de desempate FIFA (§4.3 de docs/montecarlo.md).
 *
 * @param {{ id: string, teams: object[] }} group
 *   `teams` tiene exactamente 4 TeamStrength en el orden del calendario.
 * @param {Function} rng
 * @param {Map<string,{gh:number,ga:number}>} [playedResults]
 * @returns {Array<{team,group,P,W,D,L,GF,GA,GD,Pts}>}
 *   4 objetos de [1º, 2º, 3º, 4º].
 */
export function simulateGroup(group, rng, playedResults) {
  const { id, teams } = group;
  const statMap = new Map(teams.map(t => [t.code, initStat(t, id)]));
  const matchLog = [];

  for (const [hi, ai] of GROUP_FIXTURES) {
    const home = teams[hi];
    const away = teams[ai];
    const { gh, ga } = simulateGroupMatch(home, away, rng, playedResults);

    const sH = statMap.get(home.code);
    const sA = statMap.get(away.code);
    sH.P++; sH.GF += gh; sH.GA += ga; sH.GD += gh - ga;
    sA.P++; sA.GF += ga; sA.GA += gh; sA.GD += ga - gh;
    if      (gh > ga)   { sH.W++; sH.Pts += 3; sA.L++;              }
    else if (gh === ga) { sH.D++; sH.Pts++;    sA.D++; sA.Pts++;    }
    else                { sA.W++; sA.Pts += 3; sH.L++;              }

    matchLog.push({ home: home.code, away: away.code, gh, ga });
  }

  return rankGroup([...statMap.values()], matchLog, rng);
}

/**
 * Ordena los 12 terceros de grupo y devuelve los 8 que clasifican.
 * Cascade: Pts → GD → GF → sorteo RNG (§5 de docs/montecarlo.md).
 *
 * @param {Array<Array>} allGroupResults  Resultados de 12 llamadas a simulateGroup
 * @param {Function}     rng
 * @returns {Array} 8 objetos de stat de los mejores terceros
 */
export function rankBestThirds(allGroupResults, rng) {
  const thirds = allGroupResults.map(r => r[2]);
  // Asignar clave aleatoria antes de ordenar → comparador puro y determinista
  const keyed = thirds.map(s => ({ s, rk: rng() }));
  keyed.sort((a, b) =>
    (b.s.Pts - a.s.Pts) || (b.s.GD - a.s.GD) || (b.s.GF - a.s.GF) || (a.rk - b.rk)
  );
  return keyed.slice(0, 8).map(({ s }) => s);
}

// ═══════════════════════════════════════════════════════════════════
// MC-3 — Eliminatorias: bracket 31 nodos + partido ET/penales
// ═══════════════════════════════════════════════════════════════════

/**
 * Modo de asignación de terceros a slots del bracket (decisión §14-1).
 * 'ranking' = orden del ranking de `rankBestThirds` (T1=mejor, T8=peor).
 * La tabla oficial FIFA (dependiente de qué grupos aportaron terceros)
 * se incorpora en iteración posterior.
 */
export const THIRD_SLOT_MODE = 'ranking';

/**
 * Topología del bracket: 31 nodos (R32×16 + R16×8 + QF×4 + SF×2 + F×1).
 *
 * homeSlot / awaySlot en R32 referencian claves de `qualified`:
 *   '1A'..'1L'  = primeros de grupo A..L
 *   '2A'..'2L'  = segundos
 *   'T1'..'T8'  = mejores terceros en orden de ranking
 *
 * ⚠️  Asignación de terceros APROXIMADA (THIRD_SLOT_MODE='ranking').
 *     La tabla oficial FIFA depende de la combinación concreta de grupos
 *     que aportaron terceros. Se marca en la salida con isApproximateThirdsMapping.
 */
const BRACKET_NODES = [
  // ── R32 (16 partidos) ─────────────────────────────────────────
  { id:'m32_01', round:'R32', homeSlot:'1A', awaySlot:'T1',  feedsInto:'m16_01', slot:'home' },
  { id:'m32_02', round:'R32', homeSlot:'1B', awaySlot:'2A',  feedsInto:'m16_01', slot:'away' },
  { id:'m32_03', round:'R32', homeSlot:'1C', awaySlot:'T2',  feedsInto:'m16_02', slot:'home' },
  { id:'m32_04', round:'R32', homeSlot:'1D', awaySlot:'2C',  feedsInto:'m16_02', slot:'away' },
  { id:'m32_05', round:'R32', homeSlot:'1E', awaySlot:'T3',  feedsInto:'m16_03', slot:'home' },
  { id:'m32_06', round:'R32', homeSlot:'1F', awaySlot:'2E',  feedsInto:'m16_03', slot:'away' },
  { id:'m32_07', round:'R32', homeSlot:'1G', awaySlot:'T4',  feedsInto:'m16_04', slot:'home' },
  { id:'m32_08', round:'R32', homeSlot:'1H', awaySlot:'2G',  feedsInto:'m16_04', slot:'away' },
  { id:'m32_09', round:'R32', homeSlot:'1I', awaySlot:'T5',  feedsInto:'m16_05', slot:'home' },
  { id:'m32_10', round:'R32', homeSlot:'1J', awaySlot:'2I',  feedsInto:'m16_05', slot:'away' },
  { id:'m32_11', round:'R32', homeSlot:'1K', awaySlot:'T6',  feedsInto:'m16_06', slot:'home' },
  { id:'m32_12', round:'R32', homeSlot:'1L', awaySlot:'2K',  feedsInto:'m16_06', slot:'away' },
  { id:'m32_13', round:'R32', homeSlot:'2B', awaySlot:'T7',  feedsInto:'m16_07', slot:'home' },
  { id:'m32_14', round:'R32', homeSlot:'2D', awaySlot:'2F',  feedsInto:'m16_07', slot:'away' },
  { id:'m32_15', round:'R32', homeSlot:'2H', awaySlot:'T8',  feedsInto:'m16_08', slot:'home' },
  { id:'m32_16', round:'R32', homeSlot:'2J', awaySlot:'2L',  feedsInto:'m16_08', slot:'away' },
  // ── R16 (8 partidos) ──────────────────────────────────────────
  { id:'m16_01', round:'R16', homeSlot:null, awaySlot:null,  feedsInto:'mqf_01', slot:'home' },
  { id:'m16_02', round:'R16', homeSlot:null, awaySlot:null,  feedsInto:'mqf_01', slot:'away' },
  { id:'m16_03', round:'R16', homeSlot:null, awaySlot:null,  feedsInto:'mqf_02', slot:'home' },
  { id:'m16_04', round:'R16', homeSlot:null, awaySlot:null,  feedsInto:'mqf_02', slot:'away' },
  { id:'m16_05', round:'R16', homeSlot:null, awaySlot:null,  feedsInto:'mqf_03', slot:'home' },
  { id:'m16_06', round:'R16', homeSlot:null, awaySlot:null,  feedsInto:'mqf_03', slot:'away' },
  { id:'m16_07', round:'R16', homeSlot:null, awaySlot:null,  feedsInto:'mqf_04', slot:'home' },
  { id:'m16_08', round:'R16', homeSlot:null, awaySlot:null,  feedsInto:'mqf_04', slot:'away' },
  // ── QF (4 partidos) ───────────────────────────────────────────
  { id:'mqf_01', round:'QF',  homeSlot:null, awaySlot:null,  feedsInto:'msf_01', slot:'home' },
  { id:'mqf_02', round:'QF',  homeSlot:null, awaySlot:null,  feedsInto:'msf_01', slot:'away' },
  { id:'mqf_03', round:'QF',  homeSlot:null, awaySlot:null,  feedsInto:'msf_02', slot:'home' },
  { id:'mqf_04', round:'QF',  homeSlot:null, awaySlot:null,  feedsInto:'msf_02', slot:'away' },
  // ── SF (2 partidos) ───────────────────────────────────────────
  { id:'msf_01', round:'SF',  homeSlot:null, awaySlot:null,  feedsInto:'mf_01',  slot:'home' },
  { id:'msf_02', round:'SF',  homeSlot:null, awaySlot:null,  feedsInto:'mf_01',  slot:'away' },
  // ── Final ─────────────────────────────────────────────────────
  { id:'mf_01',  round:'F',   homeSlot:null, awaySlot:null,  feedsInto:null,     slot:null   },
];

/**
 * Simula un partido de eliminatoria con prórroga y penales si empata.
 *
 * Flujo: 90 min (Poisson λ completo)
 *        → si empate: ET 30 min extra (λ × 30/90)
 *        → si sigue empatado: penales con tasa histórica de shootoutRates.json
 *
 * @param {object}   home  TeamStrength local (necesita .code para shootout rates)
 * @param {object}   away  TeamStrength visitante
 * @param {Function} rng   PRNG de mulberry32
 * @returns {{ gh:number, ga:number, winner:object, viaPenalties:boolean }}
 */
export function simulateKnockoutMatch(home, away, rng) {
  const [lamH, lamA] = deriveLambdas(home, away, {});

  // 90 minutos
  let gh = samplePoisson(lamH, rng);
  let ga = samplePoisson(lamA, rng);

  // Prórroga (30 min, λ escalado ×30/90) — decisión §14-2
  if (gh === ga) {
    gh += samplePoisson(lamH * (30 / 90), rng);
    ga += samplePoisson(lamA * (30 / 90), rng);
  }

  let winner;
  let viaPenalties = false;

  if      (gh > ga) { winner = home; }
  else if (ga > gh) { winner = away; }
  else {
    // Penales: probabilidad proporcional a la tasa histórica
    const rH   = SHOOTOUT_RATES[home.code]?.rate ?? 0.5;
    const rA   = SHOOTOUT_RATES[away.code]?.rate ?? 0.5;
    const norm = rH + rA;
    const pHome = norm > 0 ? rH / norm : 0.5;
    winner = rng() < pHome ? home : away;
    viaPenalties = true;
  }

  return { gh, ga, winner, viaPenalties };
}

/**
 * Instancia los 31 KnockoutNodes llenando los slots R32 desde `qualified`.
 *
 * @param {Record<string,object>} qualified
 *   Objeto con claves '1A'..'1L', '2A'..'2L', 'T1'..'T8' → TeamStrength.
 * @returns {KnockoutNode[]}  31 nodos; R16+ tienen home/away = null hasta su ronda.
 */
export function fillBracket(qualified) {
  return BRACKET_NODES.map(tpl => ({
    id:        tpl.id,
    round:     tpl.round,
    home:      tpl.homeSlot ? (qualified[tpl.homeSlot] ?? null) : null,
    away:      tpl.awaySlot ? (qualified[tpl.awaySlot] ?? null) : null,
    result:    null,
    feedsInto: tpl.feedsInto,
    slot:      tpl.slot,
  }));
}

/**
 * Recorre los 31 nodos del bracket en orden topológico (R32→R16→QF→SF→F),
 * propagando ganadores y devolviendo el campeón + árbol completo.
 *
 * @param {Record<string,object>} qualified  Ver fillBracket.
 * @param {Function}              rng
 * @returns {{
 *   nodes: KnockoutNode[],
 *   champion: object|null,
 *   isApproximateThirdsMapping: boolean
 * }}
 */
export function simulateBracket(qualified, rng) {
  const nodes = fillBracket(qualified);
  const byId  = new Map(nodes.map(n => [n.id, n]));

  for (const round of ['R32', 'R16', 'QF', 'SF', 'F']) {
    for (const node of nodes) {
      if (node.round !== round || !node.home || !node.away) continue;
      const result = simulateKnockoutMatch(node.home, node.away, rng);
      node.result  = result;
      if (node.feedsInto) {
        byId.get(node.feedsInto)[node.slot] = result.winner;
      }
    }
  }

  return {
    nodes,
    champion:                   byId.get('mf_01')?.result?.winner ?? null,
    isApproximateThirdsMapping: true,
  };
}

// ═══════════════════════════════════════════════════════════════════
// MC-4 — Agregación en streaming: runTournamentSimulation
// ═══════════════════════════════════════════════════════════════════

const GLETTERS = 'ABCDEFGHIJKL'.split('');

/**
 * Ejecuta N simulaciones completas del torneo (grupos → bracket) y agrega
 * los resultados en streaming — nunca guarda corridas individuales en memoria
 * (decisión §14-4).
 *
 * Entradas esperadas
 * ──────────────────
 * @param {Array<{id:string, teams:object[]}>} groups
 *   12 grupos. Cada equipo debe ser un TeamStrength:
 *   { code, attack, defense, elo, form }.
 *   Fallbacks: attack=defense=1, elo=1500, form=''.
 *
 * @param {number} nIterations  Iteraciones Monte Carlo (default 10 000).
 * @param {number} seed         Semilla del PRNG para determinismo (default 42).
 * @param {Map<string,{gh:number,ga:number}>} [playedResults]
 *   Resultados reales de fase de grupos para condicionar la simulación.
 *   Clave: "${homeCode}:${awayCode}" en el orden fijo de GROUP_FIXTURES.
 *
 * Salida (Map<code, TeamResult>)
 * ──────────────────────────────
 * TeamResult: {
 *   code, groupId,
 *   pAdvance,   // P(clasificar de grupo)
 *   pR16,       // P(ganar R32 → llegar a R16)
 *   pQF,        // P(ganar R16 → llegar a QF)
 *   pSF,        // P(ganar QF  → llegar a SF)
 *   pFinal,     // P(ganar SF  → llegar a Final)
 *   pChampion,  // P(ganar Final = Campeón)
 *   groupPosDist: [f1º, f2º, f3º, f4º],  // frecuencias de posición
 *   se: { pAdvance, pR16, pQF, pSF, pFinal, pChampion }  // error estándar binomial √(p(1-p)/N)
 * }
 *
 * Invariantes exactas por construcción (suma sobre las 48 selecciones):
 *   Σ pAdvance  = 32,  Σ pR16 = 16,  Σ pQF = 8,
 *   Σ pSF       = 4,   Σ pFinal = 2,  Σ pChampion = 1
 */
export function runTournamentSimulation(groups, nIterations = 10_000, seed = 42, playedResults = null) {
  // ── Contadores acumulados (uno por selección) ────────────────────
  const acc = new Map();
  for (const g of groups) {
    for (const t of g.teams) {
      acc.set(t.code, {
        groupId:       g.id,
        advanceCount:  0,
        r16Count:      0,
        qfCount:       0,
        sfCount:       0,
        finalCount:    0,
        championCount: 0,
        posDist:       [0, 0, 0, 0],
      });
    }
  }

  const rng = mulberry32(seed);

  // ── Bucle Monte Carlo ────────────────────────────────────────────
  for (let iter = 0; iter < nIterations; iter++) {
    // 1. Simular los 12 grupos → [1º, 2º, 3º, 4º] por grupo
    const allGroupResults = groups.map(g => simulateGroup(g, rng, playedResults));

    // 2. Acumular posiciones en el grupo
    for (let gi = 0; gi < groups.length; gi++) {
      const ranked = allGroupResults[gi];
      for (let pos = 0; pos < 4; pos++) {
        acc.get(ranked[pos].team.code).posDist[pos]++;
      }
    }

    // 3. Clasificación: 1º y 2º siempre; 3º solo si está en el top-8
    const bestThirds = rankBestThirds(allGroupResults, rng);
    const thirdSet   = new Set(bestThirds.map(s => s.team.code));

    for (let gi = 0; gi < groups.length; gi++) {
      const ranked = allGroupResults[gi];
      acc.get(ranked[0].team.code).advanceCount++;
      acc.get(ranked[1].team.code).advanceCount++;
      if (thirdSet.has(ranked[2].team.code)) {
        acc.get(ranked[2].team.code).advanceCount++;
      }
    }

    // 4. Armar el mapa qualified para el bracket
    const qualified = {};
    for (let gi = 0; gi < 12; gi++) {
      const gl = GLETTERS[gi];
      qualified[`1${gl}`] = allGroupResults[gi][0].team;
      qualified[`2${gl}`] = allGroupResults[gi][1].team;
    }
    for (let i = 0; i < 8; i++) {
      qualified[`T${i + 1}`] = bestThirds[i].team;
    }

    // 5. Simular bracket (MC-3): 31 nodos R32→F
    const { nodes } = simulateBracket(qualified, rng);

    // 6. Acumular avance en eliminatorias
    //    Ganar en ronda R → el ganador "alcanzó" la siguiente ronda
    for (const node of nodes) {
      if (!node.result) continue;
      const a = acc.get(node.result.winner.code);
      if (!a) continue;
      switch (node.round) {
        case 'R32': a.r16Count++;      break;
        case 'R16': a.qfCount++;       break;
        case 'QF':  a.sfCount++;       break;
        case 'SF':  a.finalCount++;    break;
        case 'F':   a.championCount++; break;
      }
    }
  }

  // ── Convertir contadores a probabilidades + error estándar ───────
  const N       = nIterations;
  const results = new Map();

  for (const [code, a] of acc) {
    const props = {
      pAdvance:  a.advanceCount  / N,
      pR16:      a.r16Count      / N,
      pQF:       a.qfCount       / N,
      pSF:       a.sfCount       / N,
      pFinal:    a.finalCount    / N,
      pChampion: a.championCount / N,
    };
    // Error estándar binomial: √(p·(1−p)/N)
    const se = {};
    for (const [k, v] of Object.entries(props)) {
      se[k] = Math.sqrt(v * (1 - v) / N);
    }
    results.set(code, {
      code,
      groupId:      a.groupId,
      ...props,
      groupPosDist: a.posDist.map(c => c / N),
      se,
    });
  }

  return results;
}
