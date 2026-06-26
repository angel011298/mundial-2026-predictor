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
 *   rankBestThirds      — top-8 de los 12 terceros (Pts→GD→GF→sorteo)
 *
 * Diseño documentado en docs/montecarlo.md.
 */

import { formMultiplier, LEAGUE_AVG } from './dixonColes.js';
import { HOST_CODES, HOME_ADV_ELO }   from './elo.js';

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
