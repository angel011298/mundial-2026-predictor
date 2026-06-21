/**
 * marketConsensus.js — Consenso de mercado des-vig
 * ─────────────────────────────────────────────────────────────────
 * Elimina el overround (margen de la casa) de las cuotas y promedia
 * las probabilidades "justas" resultantes entre varios bookmakers.
 *
 * Método: Normalización multiplicativa (más simple y más usada):
 *   p_justo(i) = (1/cuota_i) / Σ(1/cuota_j)
 *
 * Para el consenso multi-casa:
 *   p_consenso(i) = media aritmética de p_justo(i) entre todos los bookmakers
 *
 * Referencia: Shin (1993), Joseph et al. (2006).
 */

/**
 * Elimina el overround de las cuotas 1X2 de un solo bookmaker.
 *
 * @param {{ home: number, draw: number, away: number }} odds cuotas decimales ≥ 1.01
 * @returns {{ home, draw, away, overround }} probabilidades justas + margen original
 */
export function devig(odds) {
  if (!odds || odds.home <= 1 || odds.draw <= 1 || odds.away <= 1) {
    return { home: 1 / 3, draw: 1 / 3, away: 1 / 3, overround: 1.0 };
  }
  const raw = { home: 1 / odds.home, draw: 1 / odds.draw, away: 1 / odds.away };
  const overround = raw.home + raw.draw + raw.away;
  return {
    home:      raw.home / overround,
    draw:      raw.draw / overround,
    away:      raw.away / overround,
    overround: Number(overround.toFixed(4)),
  };
}

/**
 * Consenso de múltiples bookmakers: promedio de sus probabilidades des-vig.
 *
 * @param {Array<{ home: number, draw: number, away: number }>} booksList
 *   Lista de cuotas 1X2 de distintos bookmakers
 * @returns {{ home, draw, away, bookCount, avgOverround } | null}
 */
export function consensusProbs(booksList) {
  if (!booksList || booksList.length === 0) return null;

  const valid = booksList.filter(
    (b) => b && b.home > 1 && b.draw > 1 && b.away > 1
  );
  if (valid.length === 0) return null;

  const devigs = valid.map(devig);
  const n = devigs.length;
  const home = devigs.reduce((s, d) => s + d.home, 0) / n;
  const draw = devigs.reduce((s, d) => s + d.draw, 0) / n;
  const away = devigs.reduce((s, d) => s + d.away, 0) / n;
  const avgOverround = devigs.reduce((s, d) => s + d.overround, 0) / n;

  // Re-normalizar por si hay drift en el promedio
  const sum = home + draw + away;
  return {
    home:         home / sum,
    draw:         draw / sum,
    away:         away / sum,
    bookCount:    n,
    avgOverround: Number(avgOverround.toFixed(4)),
  };
}

/**
 * Extrae cuotas 1X2 de los markets[] de un partido (esquema extendido).
 * Devuelve la lista de cuotas por bookmaker para el mercado '1x2'.
 *
 * @param {object} match  Partido con `markets: Market[]`
 * @returns {Array<{home,draw,away}>}
 */
export function extractMarket1x2(match) {
  if (!match?.markets?.length) return [];
  const mkt1x2 = match.markets.find((m) => m.key === '1x2');
  if (!mkt1x2?.books?.length) return [];
  return mkt1x2.books
    .map((b) => ({
      home: b.outcomes?.home,
      draw: b.outcomes?.draw,
      away: b.outcomes?.away,
    }))
    .filter((o) => o.home > 1 && o.draw > 1 && o.away > 1);
}

/**
 * Punto de entrada conveniente: dados un match y las cuotas legacy,
 * devuelve el consenso de mercado o el devig de las cuotas simples.
 */
export function getMarketProbs(match, fallbackOdds) {
  // Intenta extraer cuotas reales de markets[]
  const books = extractMarket1x2(match);
  if (books.length >= 2) return consensusProbs(books);
  if (books.length === 1) return devig(books[0]);
  // Fallback a las cuotas legacy del partido
  if (fallbackOdds?.home > 1 && fallbackOdds?.draw > 1 && fallbackOdds?.away > 1) {
    return devig(fallbackOdds);
  }
  return null;
}
