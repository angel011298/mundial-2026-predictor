/**
 * adviceEngine.js
 * ───────────────────────────────────────────────────────────────
 * Motor de Consejos Inteligente para el Mundial 2026.
 *
 * Convierte cuotas decimales + estadísticas de equipo en:
 *   1. Probabilidades de Victoria/Empate (distribución implícita normalizada).
 *   2. Nivel de Riesgo dinámico ("Bajo" | "Medio" | "Alto").
 *   3. Monto recomendado vía Criterio de Kelly fraccionario (gestión de bankroll).
 *   4. Píldora de estadística clave generada dinámicamente.
 *
 * NOTA RESPONSABLE: las recomendaciones son analíticas/educativas, no
 * garantías. Apuesta solo lo que puedas permitirte perder. +18.
 */

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

// ─── 3. Probabilidades del modelo (con edge sobre la casa) ─────────

/**
 * Estima probabilidades propias mezclando la distribución implícita
 * de la casa con un modelo basado en rating de equipos. El "blend"
 * permite que aparezca valor (edge) sin alejarse demasiado del mercado.
 */
export function modelProbabilities(odds, home, away) {
  const implied = impliedProbabilities(odds);

  const rHome = teamRating(home);
  const rAway = teamRating(away);
  const diff = rHome - rAway; // >0 favorece al local

  // Modelo logístico simple sobre la diferencia de rating.
  const pHomeCore = 1 / (1 + Math.exp(-4 * diff)); // 0..1
  const pAwayCore = 1 - pHomeCore;

  // Probabilidad de empate: alta cuando los equipos están parejos.
  const drawBase = 0.30 * (1 - Math.abs(diff)); // diff 0 → ~0.30
  const pDraw = Math.min(0.4, Math.max(0.14, drawBase));

  const remaining = 1 - pDraw;
  const model = {
    home: pHomeCore * remaining,
    draw: pDraw,
    away: pAwayCore * remaining,
  };

  // Blend 55% mercado / 45% modelo → estabilidad + posibilidad de valor.
  const W = 0.55;
  const blended = {
    home: W * implied.home + (1 - W) * model.home,
    draw: W * implied.draw + (1 - W) * model.draw,
    away: W * implied.away + (1 - W) * model.away,
  };
  const sum = blended.home + blended.draw + blended.away;
  return {
    home: blended.home / sum,
    draw: blended.draw / sum,
    away: blended.away / sum,
    implied,
  };
}

// ─── 4. Criterio de Kelly (gestión de bankroll) ───────────────────

/**
 * Kelly clásico para un resultado:  f* = (b·p − q) / b
 *   b = cuota − 1 (ganancia neta por unidad)
 *   p = probabilidad del modelo,  q = 1 − p
 * Devuelve la fracción óptima (>0 solo si hay valor).
 */
export function kellyFraction(probability, decimalOdds) {
  const b = decimalOdds - 1;
  if (b <= 0) return 0;
  const q = 1 - probability;
  const f = (b * probability - q) / b;
  return f; // puede ser negativo (sin valor)
}

/**
 * Convierte la fracción de Kelly en una recomendación de bankroll
 * usando Kelly fraccionario (1/4) para reducir varianza, con tope 8%.
 */
export function recommendedStake(probability, decimalOdds) {
  const full = kellyFraction(probability, decimalOdds);
  const fractional = full * 0.25; // cuarto de Kelly (estándar conservador)
  const stakePct = Math.max(0, Math.min(0.08, fractional)) * 100;

  let label, tone;
  if (stakePct < 0.5) {
    label = 'Sin valor — Evitar';
    tone = 'muted';
  } else if (stakePct <= 2) {
    label = 'Conservador';
    tone = 'emerald';
  } else if (stakePct <= 5) {
    label = 'Moderado';
    tone = 'violet';
  } else {
    label = 'Agresivo';
    tone = 'amber';
  }

  return {
    stakePct: Number(stakePct.toFixed(1)), // ej. 2.4 (% del bankroll)
    fullKellyPct: Number((Math.max(0, full) * 100).toFixed(1)),
    hasValue: stakePct >= 0.5,
    label,
    tone,
  };
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

  const model = modelProbabilities(odds, home, away);
  const probs = { home: model.home, draw: model.draw, away: model.away };

  // Resultado recomendado = mayor probabilidad del modelo.
  const outcomes = [
    { key: 'home', label: home.name, prob: probs.home, odds: odds.home },
    { key: 'draw', label: 'Empate', prob: probs.draw, odds: odds.draw },
    { key: 'away', label: away.name, prob: probs.away, odds: odds.away },
  ];
  const pick = outcomes.reduce((best, o) => (o.prob > best.prob ? o : best), outcomes[0]);

  const stake = recommendedStake(pick.prob, pick.odds);
  const risk = riskLevel(probs, { home, away, volatility });
  const insight = keyStat(home, away, probs);

  return {
    probabilities: {
      home: Math.round(probs.home * 100),
      draw: Math.round(probs.draw * 100),
      away: Math.round(probs.away * 100),
    },
    margin: Number(((model.implied.overround - 1) * 100).toFixed(1)), // % margen casa
    pick: {
      key: pick.key,
      label: pick.key === 'draw' ? 'Empate' : pick.label,
      probability: Math.round(pick.prob * 100),
      odds: pick.odds,
    },
    stake,
    risk,
    keyStat: insight,
  };
}
