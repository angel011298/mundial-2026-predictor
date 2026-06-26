/**
 * monteCarlo.js — Motor probabilístico del Simulador Monte Carlo
 * ─────────────────────────────────────────────────────────────────
 * Expone las primitivas de bajo nivel para la simulación:
 *   mulberry32    — PRNG sembrable y determinista (alias: makeRng)
 *   samplePoisson — muestreador Knuth (≠ PMF de dixonColes.js)
 *   deriveLambdas — λ del partido: DC base + tilt Elo
 *   sampleMatch   — un resultado completo {gh, ga}
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
