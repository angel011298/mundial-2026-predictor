/**
 * elo.js — Probabilidades por sistema de rating Elo
 * ─────────────────────────────────────────────────────────────────
 * Fórmula base (Arpad Elo, 1960):
 *   E_home = 1 / (1 + 10^(−ΔElo / 400))
 *
 * donde ΔElo = eloHome − eloAway + ventajaLocalía
 *
 * E_home es la "puntuación esperada" (win=1, draw=0.5, loss=0),
 * no directamente la probabilidad de victoria. Para derivar las
 * tres probabilidades se usa un modelo de empate adaptado a Mundiales:
 *
 *   pDrawMax = 0.27     (tasa histórica de empates en fase de grupos WC)
 *   pDraw = pDrawMax × exp(−k × (ΔElo/400)²)
 *             — decrece cuanto mayor es la diferencia de Elo
 *   Restringido a: pDraw ≤ 2 × min(E_home, 1−E_home)
 *             — garantiza que pHomeWin ≥ 0 y pAwayWin ≥ 0
 *
 *   pHomeWin = E_home   − pDraw/2
 *   pAwayWin = (1−E_home) − pDraw/2
 *
 * Ventaja de localía (solo para sedes anfitrionas):
 *   USA (USA), Canadá (CAN), México (MEX) → +100 puntos Elo (~65% vs rival igual)
 */

const ELO_DIVISOR   = 400;
const HOME_ADV_ELO  = 100;   // puntos Elo equivalentes a jugar en casa (solo hosts)
const MAX_DRAW_RATE = 0.27;   // máx. tasa de empate cuando Elo diff = 0
const DRAW_DECAY_K  = 0.50;   // velocidad con que el empate decrece al aumentar la diferencia

const HOST_CODES = new Set(['USA', 'CAN', 'MEX']);

/**
 * Calcula las tres probabilidades (1X2) usando el rating Elo.
 *
 * @param {string}  homeCode  Código ISO-3 del equipo local
 * @param {number}  homeElo   Rating Elo del equipo local
 * @param {number}  awayElo   Rating Elo del equipo visitante
 * @param {object}  opts      { forceHomeAdv?: boolean }
 * @returns {{ home, draw, away, eloDiff, eHome }}
 */
export function eloProbability(homeCode = '', homeElo, awayElo, opts = {}) {
  if (homeElo == null || awayElo == null || isNaN(homeElo) || isNaN(awayElo)) {
    // Sin datos Elo: probabilidades neutras
    return { home: 0.365, draw: 0.27, away: 0.365, eloDiff: 0, eHome: 0.5 };
  }

  const isHost = HOST_CODES.has(homeCode) || opts.forceHomeAdv === true;
  const advantage = isHost ? HOME_ADV_ELO : 0;
  const eloDiff   = homeElo - awayElo + advantage;

  // Puntuación esperada del local (probabilidad "Elo clásica" de no perder ponderada)
  const eHome = 1 / (1 + Math.pow(10, -eloDiff / ELO_DIVISOR));

  // Probabilidad de empate: peak en igual Elo, decrece al aumentar la diferencia
  const pDrawUnclamped = MAX_DRAW_RATE * Math.exp(-DRAW_DECAY_K * Math.pow(eloDiff / ELO_DIVISOR, 2));

  // Clamp: pDraw no puede ser tan alta que deje pHomeWin o pAwayWin negativos
  const maxAllowedDraw = 2 * Math.min(eHome, 1 - eHome);
  const pDraw = Math.min(pDrawUnclamped, maxAllowedDraw);

  const pHome = Math.max(0, eHome - pDraw / 2);
  const pAway = Math.max(0, (1 - eHome) - pDraw / 2);

  // Re-normalizar por redondeo (suma debería ser ya 1)
  const sum = pHome + pDraw + pAway;
  return {
    home:    pHome / sum,
    draw:    pDraw / sum,
    away:    pAway / sum,
    eloDiff: Number(eloDiff.toFixed(1)),
    eHome:   Number(eHome.toFixed(4)),
  };
}

export { HOME_ADV_ELO, HOST_CODES, MAX_DRAW_RATE };
