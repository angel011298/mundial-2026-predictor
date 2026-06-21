/**
 * adviceEngine.js
 * ───────────────────────────────────────────────────────────────
 * Motor de Consejos Inteligente para el Mundial 2026.
 *
 * Convierte cuotas decimales + estadísticas de equipo en:
 *   1. Probabilidades de Victoria/Empate — blend de tres señales:
 *      Dixon-Coles (Poisson), Elo y consenso de mercado des-vig.
 *   2. Nivel de Riesgo dinámico ("Bajo" | "Medio" | "Alto").
 *   3. Monto recomendado vía Criterio de Kelly fraccionario (¼ Kelly, tope 8%).
 *   4. Píldora de estadística clave generada dinámicamente.
 *   5. Value bets y explicación del modelo (para el panel de justificación).
 *
 * NOTA RESPONSABLE: las recomendaciones son analíticas/educativas, no
 * garantías. Apuesta solo lo que puedas permitirte perder. +18.
 */

import { dixonColesProbs } from '../model/dixonColes.js';
import { eloProbability }  from '../model/elo.js';
import { getMarketProbs }  from '../model/marketConsensus.js';
import { blendProbabilities, DEFAULT_WEIGHTS } from '../model/blend.js';
import { recommendedStake as kellyStake, kellyFraction as kellyFrac } from '../model/kelly.js';
import { analyzeValue } from '../model/value.js';

// ─── 1. Probabilidades implícitas (sin margen de la casa) ──────────

/**
 * Convierte cuotas decimales a probabilidad implícita y elimina el
 * "overround" (margen del bookmaker) normalizando a suma 1.
 * @param {{home:number, draw:number, away:number}} odds cuotas decimales
 */
export function impliedProbabilities(odds) {
  const raw = {
    home: 1 / odds.home,
    draw: 1 / odds.draw,
    away: 1 / odds.away,
  };
  const overround = raw.home + raw.draw + raw.away; // > 1 → margen casa
  return {
    home: raw.home / overround,
    draw: raw.draw / overround,
    away: raw.away / overround,
    overround, // ej. 1.06 = 6% de margen
  };
}

// ─── 2. Fuerza del equipo a partir del ranking + forma ─────────────

/** Puntos de la forma reciente: W=3, D=1, L=0 (string tipo "WWDLW"). */
function formScore(form = '') {
  const map = { W: 3, D: 1, L: 0 };
  const chars = form.toUpperCase().split('');
  if (!chars.length) return 0.5;
  const total = chars.reduce((sum, c) => sum + (map[c] ?? 0), 0);
  return total / (chars.length * 3); // 0..1
}

/**
 * Rating combinado (0..1) por equipo: mezcla ranking FIFA (invertido)
 * con forma reciente. Sirve para estimar la probabilidad "del modelo"
 * y detectar valor frente a la cuota.
 */
function teamRating(team) {
  if (!team) return 0.5;
  // Ranking 1 (mejor) → ~1.0 ; ranking 100 → ~0.0 (escala log suave)
  const rank = team.rank ?? 50;
  const rankScore = Math.max(0, 1 - Math.log10(rank) / 2); // log10(100)/2 = 1
  const form = formScore(team.form);
  return 0.65 * rankScore + 0.35 * form;
}

// ─── 3. Probabilidades del modelo (blend multi-señal) ──────────────

/**
 * Estima probabilidades propias combinando tres señales independientes:
 *   1. Poisson bivariado Dixon-Coles (fuerza ofensiva/defensiva + forma)
 *   2. Rating Elo (con ventaja de localía solo para USA/CAN/MEX)
 *   3. Consenso de mercado des-vig (cuotas limpias de margen de la casa)
 *
 * Mantiene la misma firma para no romper ningún componente que la llame.
 *
 * @param {{ home, draw, away, source? }} odds  Cuotas decimales del partido
 * @param {object} home  TeamRef con { code?, avgGF?, avgGA?, form?, eloRating?, elo? }
 * @param {object} away  TeamRef con { code?, avgGF?, avgGA?, form?, eloRating?, elo? }
 * @param {object} match Partido completo (opcional, para extraer markets[])
 */
export function modelProbabilities(odds, home, away, match = null) {
  const implied = impliedProbabilities(odds);

  // ── Señal 1: Poisson Dixon-Coles ──────────────────────────────────
  let dcSignal = null;
  try {
    if (home?.avgGF != null || away?.avgGF != null) {
      const dc = dixonColesProbs(home, away);
      dcSignal = { home: dc.home, draw: dc.draw, away: dc.away };
    }
  } catch { /* fuente sin datos suficientes */ }

  // ── Señal 2: Elo ──────────────────────────────────────────────────
  let eloSignal = null;
  try {
    const homeElo = home?.elo?.rating ?? home?.eloRating ?? null;
    const awayElo = away?.elo?.rating ?? away?.eloRating ?? null;
    if (homeElo != null && awayElo != null) {
      eloSignal = eloProbability(home?.code ?? '', homeElo, awayElo);
    }
  } catch { /* sin ratings Elo */ }

  // ── Señal 3: Mercado ───────────────────────────────────────────────
  const marketSignal = getMarketProbs(match, odds);

  // ── Blend ──────────────────────────────────────────────────────────
  const blended = blendProbabilities({
    dixonColes: dcSignal,
    elo:        eloSignal,
    market:     marketSignal,
  }, DEFAULT_WEIGHTS);

  // Outputs extra de Dixon-Coles (para MatchCard expandida)
  let dcExtras = {};
  try {
    if (dcSignal) {
      const dc = dixonColesProbs(home, away);
      dcExtras = { ou25: dc.ou25, btts: dc.btts, topScore: dc.topScore, topScoreP: dc.topScoreP };
    }
  } catch { /* no crítico */ }

  return {
    home: blended.home,
    draw: blended.draw,
    away: blended.away,
    implied,
    // Para compatibilidad con ProbabilityBar y otros consumidores
    ...dcExtras,
    modelExplanation: blended.explanation,
    signalsUsed: {
      dixonColes: dcSignal != null,
      elo:        eloSignal != null,
      market:     marketSignal != null,
    },
  };
}

// ─── 4. Criterio de Kelly (gestión de bankroll) ───────────────────
// La implementación canónica vive en src/model/kelly.js. Aquí se
// re-exporta para mantener la API histórica del adviceEngine intacta.

/** @see model/kelly.js — f* = (b·p − q) / b */
export function kellyFraction(probability, decimalOdds) {
  return kellyFrac(probability, decimalOdds);
}

/**
 * Recomendación de stake (¼ Kelly, tope 8%). Acepta opts opcionales
 * { bankroll, fraction, cap } sin romper las llamadas de 2 argumentos.
 * @see model/kelly.js
 */
export function recommendedStake(probability, decimalOdds, opts = {}) {
  return kellyStake(probability, decimalOdds, opts);
}

// ─── 5. Nivel de Riesgo dinámico ──────────────────────────────────

/** Entropía de Shannon normalizada (0 = certeza total, 1 = máxima incertidumbre). */
function normalizedEntropy(probs) {
  const ps = [probs.home, probs.draw, probs.away].filter((p) => p > 0);
  const H = -ps.reduce((s, p) => s + p * Math.log(p), 0);
  return H / Math.log(3); // 3 resultados posibles
}

/**
 * Riesgo de la apuesta sugerida combinando:
 *  - Incertidumbre del resultado (entropía).
 *  - Volatilidad de las cuotas (movimiento reciente, si la API lo aporta).
 *  - Disparidad de equipos (diferencia de rating).
 */
export function riskLevel(probs, { home, away, volatility = 0 } = {}) {
  const entropy = normalizedEntropy(probs); // 0..1
  const disparity = Math.abs(teamRating(home) - teamRating(away)); // 0..1
  const vol = Math.min(1, volatility); // 0..1 (cambio relativo de cuota)

  // Más entropía y más volatilidad → más riesgo. Más disparidad → menos.
  const score = 0.55 * entropy + 0.3 * vol + 0.15 * (1 - disparity);

  let level, tone;
  if (score < 0.45) {
    level = 'Bajo';
    tone = 'emerald';
  } else if (score < 0.62) {
    level = 'Medio';
    tone = 'amber';
  } else {
    level = 'Alto';
    tone = 'rose';
  }
  return { level, tone, score: Number(score.toFixed(2)) };
}

// ─── 6. Píldora de estadística clave (generada dinámicamente) ──────

/**
 * Genera un insight legible eligiendo la tendencia más llamativa entre
 * los datos disponibles del equipo destacado (favorito del modelo).
 */
export function keyStat(home, away, probs) {
  const favIsHome = probs.home >= probs.away;
  const fav = favIsHome ? home : away;
  const opp = favIsHome ? away : home;
  if (!fav) return 'Estadísticas no disponibles para este encuentro.';

  const candidates = [];

  if (fav.avgGF >= 1.9) {
    candidates.push({
      priority: 3,
      text: `${fav.name} promedia ${fav.avgGF.toFixed(1)} goles por partido en su racha reciente.`,
    });
  }
  if (typeof fav.cleanSheets === 'number' && fav.cleanSheets >= 3) {
    candidates.push({
      priority: 3,
      text: `${fav.name} dejó su portería a cero en ${fav.cleanSheets} de sus últimos 5 partidos.`,
    });
  }
  if (fav.avgGA <= 0.7) {
    candidates.push({
      priority: 2,
      text: `${fav.name} solo recibe ${fav.avgGA.toFixed(1)} goles por partido — defensa sólida.`,
    });
  }
  const wins = (fav.form || '').toUpperCase().split('').filter((c) => c === 'W').length;
  if (wins >= 3) {
    candidates.push({
      priority: 2,
      text: `${fav.name} ganó ${wins} de sus últimos ${fav.form.length} compromisos (forma ${fav.form}).`,
    });
  }
  if (opp && opp.avgGA >= 1.4) {
    candidates.push({
      priority: 2,
      text: `${opp.name} encaja ${opp.avgGA.toFixed(1)} goles por partido: vulnerable atrás.`,
    });
  }
  if (typeof fav.rank === 'number' && typeof opp?.rank === 'number' && opp.rank - fav.rank >= 20) {
    candidates.push({
      priority: 1,
      text: `${fav.name} (#${fav.rank} FIFA) supera por ${opp.rank - fav.rank} puestos a ${opp.name} (#${opp.rank}).`,
    });
  }

  if (!candidates.length) {
    return `Duelo parejo entre ${home.name} y ${away.name}: los modelos no detectan una tendencia dominante.`;
  }
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0].text;
}

// ─── 7. Orquestador: analiza un partido completo ──────────────────

/**
 * Punto de entrada del motor. Recibe un objeto de partido normalizado
 * y devuelve el bloque analítico completo para la tarjeta de la UI.
 *
 * @param {object} match  { home, away, odds:{home,draw,away}, volatility? }
 */
export function analyzeMatch(match) {
  const { home, away, odds, volatility } = match;
  if (!odds || !odds.home || !odds.draw || !odds.away) {
    return null; // sin cuotas no hay análisis
  }

  // Pasar el partido completo para extraer markets[] si están disponibles
  const model = modelProbabilities(odds, home, away, match);
  const probs = { home: model.home, draw: model.draw, away: model.away };

  // Resultado recomendado = mayor probabilidad del modelo.
  const outcomes = [
    { key: 'home', label: home.name, prob: probs.home, odds: odds.home },
    { key: 'draw', label: 'Empate',  prob: probs.draw, odds: odds.draw },
    { key: 'away', label: away.name, prob: probs.away, odds: odds.away },
  ];
  const pick = outcomes.reduce((best, o) => (o.prob > best.prob ? o : best), outcomes[0]);

  // Bankroll del usuario (si lo configuró) para stake en divisa exacta
  const bankroll = typeof match.bankroll === 'number' ? match.bankroll : null;
  const stake   = recommendedStake(pick.prob, pick.odds, bankroll ? { bankroll } : {});
  const risk    = riskLevel(probs, { home, away, volatility });
  const insight = keyStat(home, away, probs);

  // Análisis de valor: mejor cuota por casa + EV exacto vs prob justa del mercado
  const value = analyzeValue(probs, match, odds);

  return {
    probabilities: {
      home: Math.round(probs.home * 100),
      draw: Math.round(probs.draw * 100),
      away: Math.round(probs.away * 100),
    },
    margin:  Number(((model.implied.overround - 1) * 100).toFixed(1)),
    pick: {
      key:         pick.key,
      label:       pick.key === 'draw' ? 'Empate' : pick.label,
      probability: Math.round(pick.prob * 100),
      odds:        pick.odds,
    },
    stake,
    risk,
    keyStat: insight,
    // Nuevos campos (no rompen los componentes existentes — solo agregan)
    value,                                   // { outcomes, bestValue, explanation }
    valueBets:        value.outcomes.filter((o) => o.hasValue), // compat: lista de value bets
    ou25:             model.ou25   ?? null,
    btts:             model.btts   ?? null,
    topScore:         model.topScore ?? null,
    modelExplanation: model.modelExplanation ?? null,
    signalsUsed:      model.signalsUsed ?? null,
  };
}
