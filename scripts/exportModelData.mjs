/**
 * exportModelData.mjs — Exporta la salida del modelo JS a JSON para validación Python.
 *
 * Uso:
 *   node scripts/exportModelData.mjs
 *
 * Genera: notebooks/model_output.json
 * Requiere: Node.js ≥ 18 (ESM nativo, sin transpilación Vite).
 *
 * Este script INLINEA las fórmulas de monteCarlo.js y dixonColes.js para evitar
 * importar módulos que asumen el entorno Vite (import.meta, etc.).
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const root  = path.join(__dir, '..');

// ── Datos del JSON ────────────────────────────────────────────────────────────
const worldcup  = JSON.parse(fs.readFileSync(path.join(root, 'src/data/worldcup2026.json'), 'utf8'));
const crosswalk = JSON.parse(fs.readFileSync(path.join(root, 'src/data/team-crosswalk.json'), 'utf8'));

// ── Constantes (idénticas a los módulos JS) ──────────────────────────────────
const LEAGUE_AVG      = 1.32;
const GAMMA           = 0.15;
const ELO_DIVISOR     = 400;
const HOST_ADV_FACTOR = 1.12;
const HOME_ADV_ELO    = 100;
const HOST_CODES      = new Set(['USA', 'CAN', 'MEX']);
const MAX_GOALS       = 8;

// ── Primitivas (inline) ──────────────────────────────────────────────────────

function formMultiplier(form = '') {
  const chars = form.toUpperCase().split('').slice(-5);
  if (!chars.length) return 1.0;
  const score = chars.reduce((s, c) => s + (c === 'W' ? 1 : c === 'D' ? 0 : -1.2), 0);
  return Math.max(0.82, Math.min(1.18, 1 + (score / 5) * 0.18));
}

const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
function poisson(lambda, k) {
  if (k < 0 || k >= FACT.length || lambda <= 0) return 0;
  return Math.exp(-lambda) * Math.pow(lambda, k) / FACT[k];
}

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function samplePoisson(lambda, rng) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return Math.min(k - 1, 12);
}

// ── Modelo Analítico: Dixon-Coles (sin Elo) ──────────────────────────────────
function analyticalLambdas(homeRaw, awayRaw) {
  const isHost = HOST_CODES.has(homeRaw.code);
  const hostAdv = isHost ? HOST_ADV_FACTOR : 1.0;
  const fmH = formMultiplier(homeRaw.form ?? '');
  const fmA = formMultiplier(awayRaw.form ?? '');
  const lamH = (homeRaw.avgGF / LEAGUE_AVG) * (awayRaw.avgGA / LEAGUE_AVG) * LEAGUE_AVG * hostAdv * fmH;
  const lamA = (awayRaw.avgGF / LEAGUE_AVG) * (homeRaw.avgGA / LEAGUE_AVG) * LEAGUE_AVG * fmA;
  return [Math.min(lamH, 6), Math.min(lamA, 6)];
}

// ── Modelo MC: DC + tilt Elo (identical a deriveLambdas de monteCarlo.js) ────
function deriveLambdas(H, A) {
  const homeAdv = HOST_CODES.has(H.code) ? HOST_ADV_FACTOR : 1.0;
  const fmH = formMultiplier(H.form ?? '');
  const fmA = formMultiplier(A.form ?? '');
  let lamH = H.attack * A.defense * LEAGUE_AVG * homeAdv * fmH;
  let lamA = A.attack * H.defense * LEAGUE_AVG * fmA;
  const eloAdv  = HOST_CODES.has(H.code) ? HOME_ADV_ELO : 0;
  const eloDiff = (H.elo - A.elo) + eloAdv;
  const tilt    = Math.exp(GAMMA * eloDiff / ELO_DIVISOR);
  lamH *= Math.sqrt(tilt);
  lamA /= Math.sqrt(tilt);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return [clamp(lamH, 0.15, 6), clamp(lamA, 0.15, 6)];
}

// ── Búsqueda de equipo ────────────────────────────────────────────────────────
const eloMap = new Map(crosswalk.map(t => [t.code, t.eloRating]));

function findTeam(code) {
  for (const g of worldcup.groups) {
    const t = g.teams.find(t => t.code === code);
    if (t) return t;
  }
  return null;
}

// Elegir ARG vs FRA (o el primer par disponible de grupos distintos con datos completos)
let homeRaw = findTeam('ARG');
let awayRaw = findTeam('FRA');

// Si alguno no existe en el JSON, tomar los dos primeros equipos del torneo
if (!homeRaw) homeRaw = worldcup.groups[0].teams[0];
if (!awayRaw) awayRaw = worldcup.groups[1]?.teams[0] ?? worldcup.groups[0].teams[1];

function toStrength(t) {
  return {
    code:    t.code,
    name:    t.name,
    attack:  t.avgGF / LEAGUE_AVG,
    defense: t.avgGA / LEAGUE_AVG,
    elo:     eloMap.get(t.code) ?? 1500,
    form:    t.form ?? '',
    avgGF:   t.avgGF,
    avgGA:   t.avgGA,
  };
}

const H = toStrength(homeRaw);
const A = toStrength(awayRaw);

// ── 1. Analítico ─────────────────────────────────────────────────────────────
const [lamH_dc, lamA_dc] = analyticalLambdas(homeRaw, awayRaw);

let pH_a = 0, pD_a = 0, pA_a = 0;
const mat_dc = [];
for (let h = 0; h < MAX_GOALS; h++) {
  mat_dc[h] = [];
  for (let a = 0; a < MAX_GOALS; a++) {
    const p = poisson(lamH_dc, h) * poisson(lamA_dc, a);
    mat_dc[h][a] = p;
    if (h > a) pH_a += p; else if (h === a) pD_a += p; else pA_a += p;
  }
}
const sumA = pH_a + pD_a + pA_a;

// ── 2. Monte Carlo (DC + Elo) ────────────────────────────────────────────────
const [lamH_mc, lamA_mc] = deriveLambdas(H, A);
const N   = 50_000;
const rng = mulberry32(42);
const counts = {};
let pH_mc = 0, pD_mc = 0, pA_mc = 0;

console.log(`Simulando ${N.toLocaleString()} partidos ${H.code} vs ${A.code}…`);
for (let i = 0; i < N; i++) {
  const gh = samplePoisson(lamH_mc, rng);
  const ga = samplePoisson(lamA_mc, rng);
  const key = `${gh}-${ga}`;
  counts[key] = (counts[key] ?? 0) + 1;
  if (gh > ga) pH_mc++; else if (gh === ga) pD_mc++; else pA_mc++;
}

// Top-30 marcadores por frecuencia
const topCounts = Object.fromEntries(
  Object.entries(counts)
    .sort(([, b1], [, b2]) => b2 - b1)
    .slice(0, 30)
);

// ── 3. Salida ────────────────────────────────────────────────────────────────
const output = {
  generated: new Date().toISOString(),
  match: { home: H.code, homeName: H.name, away: A.code, awayName: A.name },
  inputs: {
    home: { code: H.code, avgGF: H.avgGF, avgGA: H.avgGA, elo: H.elo, form: H.form,
            attack: +H.attack.toFixed(4), defense: +H.defense.toFixed(4) },
    away: { code: A.code, avgGF: A.avgGF, avgGA: A.avgGA, elo: A.elo, form: A.form,
            attack: +A.attack.toFixed(4), defense: +A.defense.toFixed(4) },
  },
  constants: { LEAGUE_AVG, GAMMA, ELO_DIVISOR, HOST_ADV_FACTOR, HOME_ADV_ELO },
  analytical: {
    description: 'Dixon-Coles Poisson bivariado — SIN ajuste Elo (mismo que modo Analítico del modal)',
    lambdaH:  +lamH_dc.toFixed(6),
    lambdaA:  +lamA_dc.toFixed(6),
    pHome:    +(pH_a / sumA).toFixed(6),
    pDraw:    +(pD_a / sumA).toFixed(6),
    pAway:    +(pA_a / sumA).toFixed(6),
    matrix6x6: mat_dc.slice(0, 6).map(row => row.slice(0, 6).map(p => +p.toFixed(6))),
  },
  monteCarlo: {
    description: 'DC base + tilt Elo (mismo que modo Monte Carlo del modal — deriveLambdas)',
    lambdaH:  +lamH_mc.toFixed(6),
    lambdaA:  +lamA_mc.toFixed(6),
    nSims:    N,
    seed:     42,
    pHome:    +(pH_mc / N).toFixed(6),
    pDraw:    +(pD_mc / N).toFixed(6),
    pAway:    +(pA_mc / N).toFixed(6),
    top30:    topCounts,
  },
};

const outDir  = path.join(root, 'notebooks');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'model_output.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');

console.log(`✓  Exportado → notebooks/model_output.json`);
console.log(`   ${H.code} vs ${A.code}`);
console.log(`   Analítico  λH=${output.analytical.lambdaH}  λA=${output.analytical.lambdaA}`);
console.log(`   MC+Elo     λH=${output.monteCarlo.lambdaH}  λA=${output.monteCarlo.lambdaA}`);
console.log(`   P(1/X/2)   analítico: ${(output.analytical.pHome*100).toFixed(1)} / ${(output.analytical.pDraw*100).toFixed(1)} / ${(output.analytical.pAway*100).toFixed(1)}`);
console.log(`              MC+Elo:    ${(output.monteCarlo.pHome*100).toFixed(1)} / ${(output.monteCarlo.pDraw*100).toFixed(1)} / ${(output.monteCarlo.pAway*100).toFixed(1)}`);
