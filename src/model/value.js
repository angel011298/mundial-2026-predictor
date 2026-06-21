/**
 * value.js — Detección de apuestas de valor (value bets)
 * ─────────────────────────────────────────────────────────────────
 * Una apuesta tiene VALOR cuando la probabilidad del modelo supera la
 * probabilidad "justa" que implica el mercado (cuotas des-vig).
 *
 * Definiciones (PLAN §3):
 *   EV%  = (P_modelo × mejor_cuota) − 1
 *   Hay value  ⟺  P_modelo > 1 / mejor_cuota   ⟺  EV% > 0
 *
 * "mejor_cuota" = la cuota decimal MÁS ALTA disponible entre todas las
 * casas para ese resultado (es la que mejor paga al apostador).
 * La probabilidad justa de referencia sale del consenso des-vig de todas
 * las casas (marketConsensus.js), no de una sola.
 */

import { consensusProbs, devig, extractMarket1x2 } from './marketConsensus.js';

/** EV porcentual de una apuesta. EV>0 ⇒ valor esperado positivo. */
export function evPercent(modelProb, decimalOdds) {
  if (!modelProb || !decimalOdds || decimalOdds <= 1) return 0;
  return Number(((modelProb * decimalOdds - 1) * 100).toFixed(2));
}

/**
 * Encuentra la mejor cuota (la más alta) por resultado entre todas las casas.
 *
 * @param {object} match  Partido con `markets[]` (esquema extendido)
 * @param {object} [fallbackOdds]  Cuotas legacy {home,draw,away,source} de respaldo
 * @returns {{ home, draw, away }} cada uno: { odds, book } | null
 */
export function bestOdds(match, fallbackOdds = null) {
  const result = { home: null, draw: null, away: null };

  const mkt1x2 = match?.markets?.find((m) => m.key === '1x2');
  if (mkt1x2?.books?.length) {
    for (const book of mkt1x2.books) {
      for (const key of ['home', 'draw', 'away']) {
        const price = book.outcomes?.[key];
        if (price > 1 && (!result[key] || price > result[key].odds)) {
          result[key] = { odds: Number(price), book: book.bookmaker ?? 'desconocida' };
        }
      }
    }
  }

  // Rellenar con cuotas legacy lo que no provino de markets[]
  if (fallbackOdds) {
    for (const key of ['home', 'draw', 'away']) {
      if (!result[key] && fallbackOdds[key] > 1) {
        result[key] = { odds: Number(fallbackOdds[key]), book: fallbackOdds.source ?? 'modelo' };
      }
    }
  }

  return result;
}

/**
 * Probabilidad justa del mercado (des-vig) por resultado.
 * Usa consenso multi-casa si hay ≥2 libros; si no, des-vig de las cuotas legacy.
 */
function fairMarketProbs(match, fallbackOdds) {
  const books = extractMarket1x2(match);
  if (books.length >= 2) return consensusProbs(books);
  if (books.length === 1) return devig(books[0]);
  if (fallbackOdds?.home > 1 && fallbackOdds?.draw > 1 && fallbackOdds?.away > 1) {
    return devig(fallbackOdds);
  }
  return null;
}

/**
 * Analiza el valor de las tres selecciones 1X2 de un partido.
 *
 * @param {{home,draw,away}} modelProbs  Probabilidades del modelo (0..1)
 * @param {object} match  Partido con markets[]
 * @param {object} [fallbackOdds]  Cuotas legacy de respaldo
 * @returns {{
 *   outcomes: Array<{outcome,label,modelProb,fairProb,edge,bestOdds,bestBook,ev,hasValue}>,
 *   bestValue: object | null,
 *   explanation: object
 * }}
 */
export function analyzeValue(modelProbs, match, fallbackOdds = null) {
  if (!modelProbs) {
    return { outcomes: [], bestValue: null, explanation: { reason: 'sin probabilidades del modelo' } };
  }

  const best = bestOdds(match, fallbackOdds);
  const fair = fairMarketProbs(match, fallbackOdds);

  const LABELS = { home: 'Victoria local', draw: 'Empate', away: 'Victoria visitante' };

  const outcomes = ['home', 'draw', 'away'].map((key) => {
    const modelProb = modelProbs[key] ?? 0;
    const fairProb  = fair?.[key] ?? null;
    const oddsInfo  = best[key];
    const odds      = oddsInfo?.odds ?? null;
    const ev        = odds ? evPercent(modelProb, odds) : 0;
    // Value confirmado: EV>0 Y el modelo supera la prob justa del mercado
    const edge      = fairProb != null ? Number((modelProb - fairProb).toFixed(4)) : null;
    const hasValue  = ev > 0 && (fairProb == null || modelProb > fairProb) && modelProb > 0.05;

    return {
      outcome:   key,
      label:     LABELS[key],
      modelProb: Number(modelProb.toFixed(4)),
      fairProb,
      edge,
      bestOdds:  odds,
      bestBook:  oddsInfo?.book ?? null,
      ev,
      hasValue,
    };
  });

  // Mejor value = mayor EV entre los que tienen value
  const valueOnes = outcomes.filter((o) => o.hasValue);
  const bestValue = valueOnes.length
    ? valueOnes.reduce((a, b) => (b.ev > a.ev ? b : a))
    : null;

  return {
    outcomes,
    bestValue,
    explanation: {
      definition:  'EV% = (P_modelo × mejor_cuota) − 1 ; value si P_modelo > P_justa_mercado',
      bookCount:   fair?.bookCount ?? (extractMarket1x2(match).length || (fallbackOdds ? 1 : 0)),
      fairSource:  fair?.bookCount >= 2 ? 'consenso multi-casa des-vig'
                 : fair ? 'des-vig de cuota única'
                 : 'sin datos de mercado',
      avgOverround: fair?.avgOverround ?? fair?.overround ?? null,
    },
  };
}
