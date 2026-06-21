/**
 * kelly.js — Gestión de bankroll por Criterio de Kelly
 * ─────────────────────────────────────────────────────────────────
 * Implementación canónica del staking. adviceEngine.js delega aquí.
 *
 * Kelly clásico para una apuesta binaria:
 *   f* = (b·p − q) / b
 *     b = cuota_decimal − 1   (ganancia neta por unidad apostada)
 *     p = probabilidad del modelo de que la apuesta gane
 *     q = 1 − p               (probabilidad de perder)
 *
 * f* es la fracción del bankroll que MAXIMIZA el crecimiento logarítmico
 * a largo plazo. Apostar f* completo es muy volátil, así que se usa
 * **Kelly fraccionario** (¼ por defecto) y se aplica un **tope** (8%):
 *   stakePct = min(fraction · f*, cap)
 *
 * Si f* ≤ 0 → la apuesta no tiene valor esperado positivo → no apostar.
 */

export const DEFAULT_FRACTION = 0.25; // ¼ Kelly (estándar conservador)
export const DEFAULT_CAP      = 0.08; // tope 8% del bankroll por apuesta

/**
 * Fracción de Kelly completa (puede ser negativa si no hay valor).
 * @param {number} probability  Probabilidad del modelo (0..1)
 * @param {number} decimalOdds  Cuota decimal (≥ 1.01)
 * @returns {number} f* (fracción óptima sin recortar)
 */
export function kellyFraction(probability, decimalOdds) {
  const b = decimalOdds - 1;
  if (b <= 0) return 0;
  const p = probability;
  const q = 1 - p;
  return (b * p - q) / b;
}

/**
 * Etiqueta semántica + tono de color según el % de stake.
 * Tonos alineados con src/utils/format.js → toneClasses.
 */
function classifyStake(stakePct) {
  if (stakePct < 0.5) return { label: 'Sin valor — Evitar', tone: 'muted' };
  if (stakePct <= 2)  return { label: 'Conservador',        tone: 'emerald' };
  if (stakePct <= 5)  return { label: 'Moderado',           tone: 'violet' };
  return { label: 'Agresivo', tone: 'amber' };
}

/**
 * Calcula el stake recomendado para una apuesta.
 *
 * @param {number} probability  Probabilidad del modelo (0..1)
 * @param {number} decimalOdds  Cuota decimal
 * @param {object} [opts]
 * @param {number} [opts.bankroll]  Bankroll del usuario en su divisa (opcional)
 * @param {number} [opts.fraction=0.25]  Fracción de Kelly a aplicar
 * @param {number} [opts.cap=0.08]  Tope máximo como fracción del bankroll
 * @returns {{
 *   stakePct, stakeAmount, fullKellyPct, fraction, cap, capped, hasValue,
 *   label, tone, explanation
 * }}
 */
export function recommendedStake(probability, decimalOdds, opts = {}) {
  const {
    bankroll = null,
    fraction = DEFAULT_FRACTION,
    cap      = DEFAULT_CAP,
  } = opts;

  const full        = kellyFraction(probability, decimalOdds);
  const fractional  = full * fraction;             // ¼ Kelly
  const beforeCap   = Math.max(0, fractional);
  const cappedFrac  = Math.min(cap, beforeCap);    // aplica tope
  const wasCapped   = beforeCap > cap;
  const stakePct    = cappedFrac * 100;

  const { label, tone } = classifyStake(stakePct);
  const hasValue = stakePct >= 0.5;

  const stakeAmount =
    bankroll != null && bankroll > 0
      ? Number((bankroll * cappedFrac).toFixed(2))
      : null;

  return {
    stakePct:     Number(stakePct.toFixed(1)),
    stakeAmount,                                   // null si no se pasó bankroll
    fullKellyPct: Number((Math.max(0, full) * 100).toFixed(1)),
    fraction,
    cap,
    capped:       wasCapped,
    hasValue,
    label,
    tone,
    explanation: {
      formula:      'f* = (b·p − q) / b ; stake = min(fraction · f*, cap)',
      b:            Number((decimalOdds - 1).toFixed(4)),
      p:            Number(probability.toFixed(4)),
      q:            Number((1 - probability).toFixed(4)),
      fullKelly:    Number(full.toFixed(4)),
      fractionUsed: fraction,
      capUsed:      cap,
      cappedAt:     wasCapped ? `Recortado al tope ${(cap * 100).toFixed(0)}%` : 'Sin recorte',
      bankroll:     bankroll ?? null,
      result:       stakeAmount != null
        ? `${stakePct.toFixed(1)}% = ${stakeAmount} sobre bankroll ${bankroll}`
        : `${stakePct.toFixed(1)}% del bankroll`,
    },
  };
}
