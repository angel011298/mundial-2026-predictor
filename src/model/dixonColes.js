/**
 * dixonColes.js — Modelo Poisson Bivariado (Dixon & Coles, 1997)
 * ─────────────────────────────────────────────────────────────────
 * Estima las tasas de goles esperadas (λ) para cada equipo a partir
 * de sus promedios de goles anotados/recibidos, corregidos por la
 * solidez defensiva del rival y la forma reciente.
 *
 * Fórmulas principales:
 *   α_i = team.avgGF / LEAGUE_AVG           (ataque relativo al promedio)
 *   β_i = team.avgGA / LEAGUE_AVG           (vulnerabilidad defensiva relativa)
 *   λ_home = α_home × β_away × LEAGUE_AVG × homeAdv
 *   λ_away = α_away × β_home  × LEAGUE_AVG
 *   P(home=h, away=a) = Poisson(h; λ_home) × Poisson(a; λ_away)
 *
 * Distribuciones derivadas de la matriz de marcadores:
 *   P(Victoria local) = Σ_{h>a} P(h,a)
 *   P(Empate)         = Σ_{h=a} P(h,a)
 *   P(Victoria visit) = Σ_{h<a} P(h,a)
 *   P(Over 2.5)       = Σ_{h+a≥3} P(h,a)
 *   P(Ambos marcan)   = Σ_{h≥1,a≥1} P(h,a)
 */

const LEAGUE_AVG = 1.32;  // media histórica de goles por equipo por partido en Mundiales
const MAX_GOALS  = 8;     // techo de la matriz (P(≥8 goles) negligible)
const HOME_ADV_FACTOR = 1.0; // sin ventaja de local genérica (solo hosts USA/CAN/MEX)

// Códigos de selecciones sede con ventaja real de localía
const HOST_CODES = new Set(['USA', 'CAN', 'MEX']);
const HOST_ADV   = 1.12;  // ~12% más de goles para el anfitrión en casa

/** Tabla de factoriales precalculados para k ∈ [0, MAX_GOALS-1] */
const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];

/** Distribución de Poisson: P(X = k | λ) */
function poisson(lambda, k) {
  if (k < 0 || k >= FACT.length || lambda <= 0) return 0;
  return Math.exp(-lambda) * Math.pow(lambda, k) / FACT[k];
}

/**
 * Ajuste de λ por forma reciente.
 * "WWDLW" → más victorias → factor > 1 (mayor expectativa goleadora).
 * Rango: [0.82, 1.18] — suave para no sobreponderar forma sobre rendimiento.
 */
function formMultiplier(form = '') {
  const chars = form.toUpperCase().split('').slice(-5);
  if (!chars.length) return 1.0;
  const score = chars.reduce((s, c) => s + (c === 'W' ? 1 : c === 'D' ? 0 : -1.2), 0);
  return Math.max(0.82, Math.min(1.18, 1 + (score / 5) * 0.18));
}

/**
 * Genera la matriz de probabilidades de marcadores.
 * matrix[h][a] = P(goles_local = h, goles_visitante = a)
 */
function scoreMatrix(lambdaH, lambdaA) {
  const mat = [];
  for (let h = 0; h < MAX_GOALS; h++) {
    mat[h] = [];
    for (let a = 0; a < MAX_GOALS; a++) {
      mat[h][a] = poisson(lambdaH, h) * poisson(lambdaA, a);
    }
  }
  return mat;
}

/**
 * Deriva todas las probabilidades desde la matriz de marcadores.
 * @returns {{ home, draw, away, ou25, btts, topScore, topScoreP, lambdaHome, lambdaAway }}
 */
function deriveProbs(matrix, lambdaH, lambdaA) {
  let pHome = 0, pDraw = 0, pAway = 0;
  let pOver = 0, pBtts = 0;
  let best  = { h: 0, a: 0, p: -1 };

  for (let h = 0; h < MAX_GOALS; h++) {
    for (let a = 0; a < MAX_GOALS; a++) {
      const p = matrix[h][a];
      if (h > a)  pHome += p;
      if (h === a) pDraw += p;
      if (h < a)  pAway += p;
      if (h + a >= 3) pOver += p;
      if (h >= 1 && a >= 1) pBtts += p;
      if (p > best.p) best = { h, a, p };
    }
  }

  const sum = pHome + pDraw + pAway; // debería ser ~1; normalizar por truncamiento
  return {
    home: pHome / sum,
    draw: pDraw / sum,
    away: pAway / sum,
    ou25:     { over: pOver, under: 1 - pOver },
    btts:     { yes: pBtts, no: 1 - pBtts },
    topScore: `${best.h}-${best.a}`,
    topScoreP: Number(best.p.toFixed(4)),
    lambdaHome: Number(lambdaH.toFixed(3)),
    lambdaAway: Number(lambdaA.toFixed(3)),
  };
}

/**
 * Punto de entrada: calcula probabilidades Poisson para un partido.
 *
 * @param {object} home  TeamRef con { code, avgGF, avgGA, form? }
 * @param {object} away  TeamRef con { code, avgGF, avgGA, form? }
 * @param {object} opts  { homeAdvantage? } — 1.0 sin ventaja, 1.12 para hosts
 * @returns {object} distribución completa de probabilidades
 */
export function dixonColesProbs(home, away, opts = {}) {
  const avgGF_H = Math.max(0.3, home?.avgGF ?? LEAGUE_AVG);
  const avgGA_H = Math.max(0.3, home?.avgGA ?? LEAGUE_AVG);
  const avgGF_A = Math.max(0.3, away?.avgGF ?? LEAGUE_AVG);
  const avgGA_A = Math.max(0.3, away?.avgGA ?? LEAGUE_AVG);

  // Fuerza de ataque/defensa relativa al promedio de liga
  const alphaH = avgGF_H / LEAGUE_AVG;
  const betaA  = avgGA_A / LEAGUE_AVG; // vulnerabilidad defensiva del visitante
  const alphaA = avgGF_A / LEAGUE_AVG;
  const betaH  = avgGA_H / LEAGUE_AVG; // vulnerabilidad defensiva del local

  // Ventaja de localía: explícita (opts) o inferida por código de host
  const isHost = HOST_CODES.has(home?.code ?? '');
  const homeAdv = opts.homeAdvantage ?? (isHost ? HOST_ADV : HOME_ADV_FACTOR);

  // λ esperados con ajuste de forma
  const fmH = formMultiplier(home?.form);
  const fmA = formMultiplier(away?.form);

  const lambdaH = Math.min(6, alphaH * betaA * LEAGUE_AVG * homeAdv * fmH);
  const lambdaA = Math.min(6, alphaA * betaH * LEAGUE_AVG * fmA);

  const matrix = scoreMatrix(lambdaH, lambdaA);
  return deriveProbs(matrix, lambdaH, lambdaA);
}

/** Exporta también las utilidades para testing */
export { poisson, formMultiplier, scoreMatrix, deriveProbs, LEAGUE_AVG };
