/**
 * parlay.js — Combinadas (acumuladores) con detección de correlación
 * ─────────────────────────────────────────────────────────────────
 * Una parlay (combinada) gana solo si TODAS sus patas (legs) aciertan.
 *
 * Asumiendo independencia entre patas:
 *   prob_combinada  = ∏ P_i
 *   cuota_combinada = ∏ cuota_i
 *   EV_combinado    = prob_combinada × cuota_combinada − 1
 *   payout          = stake × cuota_combinada
 *   ganancia        = payout − stake
 *
 * ⚠️ ADVERTENCIA DE HONESTIDAD (PLAN §3):
 * Las parlays MULTIPLICAN el margen de la casa y la varianza. Cada pata
 * añadida reduce la probabilidad de acierto y compone el overround.
 * Las patas del MISMO partido NO son independientes (están correlacionadas):
 * la fórmula ∏P_i las sobre/sub-estima. Se marcan y se desaconsejan.
 */

/**
 * Detecta grupos de patas correlacionadas (mismo partido).
 * @param {Array<{matchId}>} legs
 * @returns {Array<Array<number>>} grupos de índices que comparten matchId
 */
export function detectCorrelations(legs) {
  const byMatch = new Map();
  legs.forEach((leg, i) => {
    const id = leg.matchId ?? `__leg_${i}`; // sin matchId → tratado como único
    if (!byMatch.has(id)) byMatch.set(id, []);
    byMatch.get(id).push(i);
  });
  return [...byMatch.values()].filter((group) => group.length > 1);
}

/**
 * Construye una combinada a partir de sus patas.
 *
 * @param {Array<{matchId,outcome,label,prob,odds}>} legs
 * @param {object} [opts]
 * @param {number} [opts.stake=0]  Monto apostado (para calcular payout exacto)
 * @returns {{
 *   legs, combinedProb, combinedOdds, ev, stake, payout, profit,
 *   correlated, correlatedGroups, recommendation, explanation
 * }}
 */
export function buildParlay(legs = [], opts = {}) {
  const { stake = 0 } = opts;

  const valid = legs.filter((l) => l && l.prob > 0 && l.prob <= 1 && l.odds > 1);

  if (valid.length === 0) {
    return {
      legs: [], combinedProb: 0, combinedOdds: 0, ev: 0,
      stake, payout: 0, profit: 0,
      correlated: false, correlatedGroups: [],
      recommendation: { level: 'none', tone: 'muted', text: 'Sin patas válidas.' },
      explanation: { reason: 'no hay patas con prob∈(0,1] y cuota>1' },
    };
  }

  const combinedProb = valid.reduce((acc, l) => acc * l.prob, 1);
  const combinedOdds = valid.reduce((acc, l) => acc * l.odds, 1);
  const ev           = combinedProb * combinedOdds - 1;
  const payout       = stake * combinedOdds;
  const profit       = payout - stake;

  const correlatedGroups = detectCorrelations(valid);
  const correlated = correlatedGroups.length > 0;

  const recommendation = buildRecommendation({ ev, legCount: valid.length, correlated });

  return {
    legs: valid.map((l) => ({
      matchId: l.matchId ?? null,
      outcome: l.outcome ?? null,
      label:   l.label ?? null,
      prob:    Number(l.prob.toFixed(4)),
      odds:    Number(l.odds.toFixed(2)),
    })),
    combinedProb: Number(combinedProb.toFixed(4)),
    combinedOdds: Number(combinedOdds.toFixed(2)),
    ev:           Number((ev * 100).toFixed(2)), // en %
    stake:        Number(stake.toFixed(2)),
    payout:       Number(payout.toFixed(2)),
    profit:       Number(profit.toFixed(2)),
    correlated,
    correlatedGroups,
    recommendation,
    explanation: {
      formulaProb:  'prob_combinada = ∏ P_i',
      formulaOdds:  'cuota_combinada = ∏ cuota_i',
      formulaEV:    'EV = prob_combinada × cuota_combinada − 1',
      formulaPayout:'payout = stake × cuota_combinada',
      legCount:     valid.length,
      perLeg:       valid.map((l) => ({
        label: l.label ?? l.outcome,
        prob:  Number(l.prob.toFixed(4)),
        odds:  Number(l.odds.toFixed(2)),
      })),
      correlationNote: correlated
        ? 'Patas del mismo partido detectadas: NO son independientes; ∏P_i no es válido y se desaconseja.'
        : 'Todas las patas son de partidos distintos (independencia asumida).',
      varianceNote: 'Cada pata extra multiplica el margen de la casa y la varianza.',
    },
  };
}

/** Genera la recomendación legible según EV, número de patas y correlación. */
function buildRecommendation({ ev, legCount, correlated }) {
  if (correlated) {
    return {
      level: 'avoid',
      tone:  'rose',
      text:  'Desaconsejada: incluye patas correlacionadas (mismo partido). La probabilidad combinada no es fiable.',
    };
  }
  if (ev <= 0) {
    return {
      level: 'avoid',
      tone:  'rose',
      text:  `EV negativo (${(ev * 100).toFixed(1)}%): a largo plazo pierde. Mejor apuestas simples.`,
    };
  }
  if (legCount >= 4) {
    return {
      level: 'caution',
      tone:  'amber',
      text:  `${legCount} patas: aunque el EV es positivo, la probabilidad de acierto es baja y la varianza alta.`,
    };
  }
  return {
    level: 'ok',
    tone:  'emerald',
    text:  `EV positivo (+${(ev * 100).toFixed(1)}%) con ${legCount} patas independientes.`,
  };
}
