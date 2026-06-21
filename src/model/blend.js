/**
 * blend.js — Mezclador de señales probabilísticas
 * ─────────────────────────────────────────────────────────────────
 * Combina las tres señales del modelo con pesos configurables:
 *   1. Dixon-Coles  (Poisson bivariado sobre estadísticas de goles)
 *   2. Elo          (rating histórico con corrección de localía)
 *   3. Market       (consenso de mercado des-vig)
 *
 * Pesos por defecto (calibrables contra resultados reales):
 *   dixonColes: 0.40 — captura fuerza ofensiva/defensiva reciente
 *   elo:        0.25 — ancla histórica y robusta
 *   market:     0.35 — incorpora información de 350+ bookmakers
 *
 * Si alguna señal no está disponible, sus pesos se redistribuyen
 * proporcionalmente entre las señales restantes.
 *
 * Devuelve un objeto de explicabilidad completo para el panel de justificación.
 */

export const DEFAULT_WEIGHTS = {
  dixonColes: 0.40,
  elo:        0.25,
  market:     0.35,
};

/** Normaliza un objeto {home,draw,away} para que sume exactamente 1. */
function normalize(probs) {
  const sum = (probs.home ?? 0) + (probs.draw ?? 0) + (probs.away ?? 0);
  if (sum <= 0) return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  return { home: probs.home / sum, draw: probs.draw / sum, away: probs.away / sum };
}

/**
 * Mezcla las señales con pesos y devuelve probablidades + objeto de explicación.
 *
 * @param {object} signals  { dixonColes?, elo?, market? }  cada uno: {home,draw,away}
 * @param {object} weights  Pesos (DEFAULT_WEIGHTS por defecto)
 * @returns {{ home, draw, away, explanation }}
 */
export function blendProbabilities(signals = {}, weights = DEFAULT_WEIGHTS) {
  // Filtrar señales disponibles (no nulas, no undefined)
  const available = Object.entries(weights).filter(
    ([key]) => signals[key] != null &&
               signals[key].home != null &&
               signals[key].draw != null &&
               signals[key].away != null
  );

  if (available.length === 0) {
    // Sin ninguna señal: distribución uniforme
    return {
      home: 1 / 3, draw: 1 / 3, away: 1 / 3,
      explanation: { inputs: signals, weights: {}, contributions: {}, fallback: true },
    };
  }

  // Re-normalizar pesos entre las señales disponibles
  const totalWeight = available.reduce((s, [, w]) => s + w, 0);
  const normWeights = Object.fromEntries(
    available.map(([key, w]) => [key, w / totalWeight])
  );

  // Ponderar cada señal
  let home = 0, draw = 0, away = 0;
  const contributions = {};

  for (const [key, normW] of Object.entries(normWeights)) {
    const sig = normalize(signals[key]);
    const contrib = {
      home: normW * sig.home,
      draw: normW * sig.draw,
      away: normW * sig.away,
    };
    home += contrib.home;
    draw += contrib.draw;
    away += contrib.away;
    contributions[key] = {
      weight:       Number(normW.toFixed(4)),
      probs:        { home: Number(sig.home.toFixed(4)), draw: Number(sig.draw.toFixed(4)), away: Number(sig.away.toFixed(4)) },
      contribution: { home: Number(contrib.home.toFixed(4)), draw: Number(contrib.draw.toFixed(4)), away: Number(contrib.away.toFixed(4)) },
    };
  }

  // Normalización final por precisión de punto flotante
  const sum = home + draw + away;
  return {
    home: home / sum,
    draw: draw / sum,
    away: away / sum,
    explanation: {
      inputs:        Object.fromEntries(
        available.map(([k]) => [k, {
          home: Number(signals[k].home.toFixed(4)),
          draw: Number(signals[k].draw.toFixed(4)),
          away: Number(signals[k].away.toFixed(4)),
        }])
      ),
      weights:       normWeights,
      contributions,
      fallback:      false,
    },
  };
}

/**
 * Calcula el Edge Value (EV%) para un resultado dado.
 * EV > 0 → hay valor (el modelo asigna más probabilidad que la cuota implica).
 *
 * @param {number} modelProb  Probabilidad del modelo (0..1)
 * @param {number} decimalOdds Cuota decimal del bookmaker (p.ej. 2.10)
 * @returns {number} EV como porcentaje, ej. 5.2 significa +5.2%
 */
export function expectedValue(modelProb, decimalOdds) {
  if (!modelProb || !decimalOdds || decimalOdds <= 1) return 0;
  return Number(((modelProb * decimalOdds - 1) * 100).toFixed(2));
}

/**
 * Detecta value bets comparando el modelo vs las cuotas de un partido.
 * @param {{ home, draw, away }} modelProbs  Probabilidades del modelo (0..1 cada una)
 * @param {{ home, draw, away }} bestOdds    Mejores cuotas disponibles (decimales)
 * @returns {Array<{ outcome, modelProb, bestOdds, ev }>} solo los outcomes con EV > 0
 */
export function detectValueBets(modelProbs, bestOdds) {
  if (!modelProbs || !bestOdds) return [];
  const outcomes = [
    { outcome: 'home', label: 'Victoria local', modelProb: modelProbs.home, bestOdds: bestOdds.home },
    { outcome: 'draw', label: 'Empate',          modelProb: modelProbs.draw, bestOdds: bestOdds.draw },
    { outcome: 'away', label: 'Victoria visita', modelProb: modelProbs.away, bestOdds: bestOdds.away },
  ];
  return outcomes
    .map((o) => ({ ...o, ev: expectedValue(o.modelProb, o.bestOdds) }))
    .filter((o) => o.ev > 0 && o.modelProb > 0.05 && o.bestOdds > 1);
}
