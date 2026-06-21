/**
 * dataFusion.js
 * ─────────────────────────────────────────────────────────────────
 * Capa de fusión de datos para el Mundial 2026.
 *
 * Interfaz pública (compatible con sportsApiService.js anterior):
 *   getLiveMatches()   → Promise<Match[]>
 *   getProviderInfo()  → { provider, isDemo, label }
 *
 * Nuevo en este módulo:
 *   pickPrimaryOdds(match) → { home, draw, away, source }   (compatibilidad con adviceEngine)
 *
 * Fuentes (en orden de prioridad/fallback):
 *   1. /api/worldcup  → calendar completo (rezarahiminia, 104 fixtures)
 *   2. /api/matches   → ESPN en vivo (overlay status/score/minute)
 *   3. /api/elo       → ratings Elo por equipo
 *   4. /api/apifootball  → form, stats, standings (con clave)
 *   5. /api/balldontlie  → datos+odds adicionales (con clave)
 *   6. /api/sportsgameodds → odds multi-mercado (con clave)
 *   7. /api/oddspapi     → odds 350+ casas (con clave, muy limitada)
 *   8. Fallback local: worldcup2026.json + team-crosswalk.json + buildOdds()
 */

import rawCrosswalk from '../data/team-crosswalk.json';
import worldcup     from '../data/worldcup2026.json';

// ─── Índices de lookup (construidos una sola vez al importar) ─────

/** Array canónico de las 48 selecciones */
const CROSSWALK = rawCrosswalk;

/** Mapa code → entrada del crosswalk */
const BY_CODE = Object.fromEntries(CROSSWALK.map((t) => [t.code, t]));

/** Mapa nombre-ESPN (lowercase) → code canónico */
const BY_ESPN_NAME = {};
for (const t of CROSSWALK) {
  for (const name of (t.espnNames ?? [])) {
    BY_ESPN_NAME[name.toLowerCase()] = t.code;
  }
  // También el nombre español e inglés como variantes
  if (t.es) BY_ESPN_NAME[t.es.toLowerCase()] = t.code;
  if (t.en) BY_ESPN_NAME[t.en.toLowerCase()] = t.code;
}

/** Fallback de allTeams del JSON local (estructura existente para buildOdds / resolveTeam) */
const LOCAL_TEAMS = worldcup.groups.flatMap((g) =>
  g.teams.map((t) => ({ ...t, group: g.id }))
);

// ─── Utilidades ───────────────────────────────────────────────────

function rand(min, max) { return Math.random() * (max - min) + min; }

/** Resuelve un nombre/code de cualquier fuente → entrada del crosswalk.
 *  Devuelve un TeamRef base (sin score). */
function resolveTeam(rawName = '') {
  if (!rawName) return null;
  const lower = rawName.toLowerCase().trim();
  // 1. Lookup directo por ESPN name
  const code = BY_ESPN_NAME[lower];
  if (code && BY_CODE[code]) return teamRefFromCrosswalk(BY_CODE[code]);
  // 2. Lookup por code directo (3 letras)
  const upper = rawName.toUpperCase().trim();
  if (BY_CODE[upper]) return teamRefFromCrosswalk(BY_CODE[upper]);
  // 3. Búsqueda parcial
  const found = CROSSWALK.find(
    (t) => t.en.toLowerCase().includes(lower) || t.es.toLowerCase().includes(lower)
  );
  if (found) return teamRefFromCrosswalk(found);
  // 4. Fallback genérico
  const code4 = upper.slice(0, 3);
  console.warn(`[dataFusion] equipo no resuelto: "${rawName}" → usando código "${code4}"`);
  return { code: code4, name: rawName, es: rawName, en: rawName, flag: '⚽', group: null, rank: 50, eloRating: 1700, form: '', avgGF: 1.2, avgGA: 1.2, cleanSheets: 1, elo: null, fifaRank: null, stats: null, formDetail: null };
}

function teamRefFromCrosswalk(t) {
  return {
    code:        t.code,
    name:        t.es,         // nombre español = default de display
    es:          t.es,
    en:          t.en,
    flag:        t.flag,
    group:       t.group,
    rank:        t.rank,
    eloRating:   t.eloRating,
    form:        t.form  ?? null,
    avgGF:       t.avgGF ?? 1.2,
    avgGA:       t.avgGA ?? 1.2,
    cleanSheets: t.cleanSheets ?? 1,
    elo:         null,   // se llena después con /api/elo
    fifaRank:    t.rank, // fallback al rank estático
    stats:       null,   // se llena con /api/apifootball
    formDetail:  null,
    score:       null,   // se llena en el match concreto
  };
}

/** Clave de par canónica (independiente del home/away) */
function pairKey(codeA, codeB) {
  return [codeA, codeB].sort().join('-');
}

// ─── Cuotas del modelo (fallback cuando no hay cuotas reales) ─────

function buildOdds(home, away) {
  const rankH = home?.rank ?? home?.fifaRank ?? 50;
  const rankA = away?.rank ?? away?.fifaRank ?? 50;
  const rh   = Math.max(0, 1 - Math.log10(rankH) / 2);
  const ra   = Math.max(0, 1 - Math.log10(rankA) / 2);
  const diff = rh - ra;
  const pHome  = 1 / (1 + Math.exp(-3.2 * diff));
  const pDraw  = Math.min(0.34, Math.max(0.16, 0.30 * (1 - Math.abs(diff))));
  const pHomA  = pHome * (1 - pDraw);
  const pAway  = (1 - pHome) * (1 - pDraw);
  const margin = 1.06;
  const toO    = (p) => Number((1 / (p * margin)).toFixed(2));
  return {
    home:   Math.max(1.05, toO(pHomA)),
    draw:   Math.max(1.05, toO(pDraw)),
    away:   Math.max(1.05, toO(pAway)),
    source: 'model',
  };
}

// ─── Fetch helpers ────────────────────────────────────────────────

const FETCH_TIMEOUT = 7000;

async function apiFetch(path) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(path, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(tid);
    return null;
  }
}

// ─── Normalización ESPN → Match ───────────────────────────────────

function normalizeESPNStatus(comp) {
  const name = comp?.status?.type?.name ?? '';
  const id   = comp?.status?.type?.id   ?? '';
  if (name === 'STATUS_IN_PROGRESS' || id === '2')  return 'live';
  if (['STATUS_FINAL','STATUS_FULL_TIME','STATUS_FINAL_AET','STATUS_FINAL_PEN'].includes(name) || id === '28') return 'finished';
  if (new Date(comp?._evDate ?? 0) < new Date(Date.now() - 120 * 60_000)) return 'finished';
  return 'upcoming';
}

function extractGroupFromESPN(ev, comp) {
  const notes = comp?.notes ?? [];
  for (const note of notes) {
    const m = (note.headline ?? note.text ?? '').match(/Group\s+([A-L])/i);
    if (m) return m[1].toUpperCase();
  }
  for (const src of [ev.name, ev.shortName, ev.league?.name, ev.season?.description]) {
    const m = (src ?? '').match(/Group\s+([A-L])/i);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

function normalizeESPNEvent(ev) {
  const comp  = ev.competitions?.[0];
  if (!comp) return null;
  const homeC = comp.competitors?.find((c) => c.homeAway === 'home');
  const awayC = comp.competitors?.find((c) => c.homeAway === 'away');
  if (!homeC || !awayC) return null;

  comp._evDate = ev.date; // para el status fallback
  const status = normalizeESPNStatus(comp);
  const clock  = comp.status?.displayClock ?? '';
  const minute = status === 'live' ? (parseInt(clock) || null) : null;

  const homeTeam = resolveTeam(homeC.team?.displayName ?? homeC.team?.name ?? '');
  const awayTeam = resolveTeam(awayC.team?.displayName ?? awayC.team?.name ?? '');
  if (!homeTeam || !awayTeam) return null;

  const homeScore = status !== 'upcoming' ? (parseInt(homeC.score) ?? null) : null;
  const awayScore = status !== 'upcoming' ? (parseInt(awayC.score) ?? null) : null;

  const group = extractGroupFromESPN(ev, comp) ?? homeTeam.group ?? null;

  const odds = buildOdds(homeTeam, awayTeam);

  return {
    id:        String(ev.id),
    sourceIds: { espn: String(ev.id) },
    stage:     'group',
    group,
    matchday:  null,
    status,
    minute,
    kickoff:   ev.date,
    venue:     null,
    home:      { ...homeTeam, score: homeScore },
    away:      { ...awayTeam, score: awayScore },
    score:     { home: homeScore, away: awayScore },
    markets:   [],
    consensus: {},
    odds,      // legacy compat
    volatility: 0,
    meta:      { lastUpdated: new Date().toISOString(), dataSources: ['espn'], freshness: { live: new Date().toISOString() }, oddsAreModel: true },
    dataSource: 'espn',
  };
}

// ─── Normalización calendario estático (worldcup2026.json) ────────

function normalizeStaticSchedule() {
  return (worldcup.schedule ?? []).map((fx) => {
    const homeTeam = resolveTeam(fx.home);
    const awayTeam = resolveTeam(fx.away);
    const odds     = buildOdds(homeTeam, awayTeam);
    return {
      id:        fx.id,
      sourceIds: { static: fx.id },
      stage:     'group',
      group:     fx.group,
      matchday:  null,
      status:    'upcoming',
      minute:    null,
      kickoff:   fx.date,
      venue:     null,
      home:      { ...homeTeam, score: null },
      away:      { ...awayTeam, score: null },
      score:     { home: null, away: null },
      markets:   [],
      consensus: {},
      odds,
      volatility: 0,
      meta:      { lastUpdated: new Date().toISOString(), dataSources: ['static-schedule'], freshness: {}, oddsAreModel: true },
      dataSource: 'schedule',
    };
  });
}

// ─── Construcción de markets[] y consensus[] ──────────────────────

/**
 * Agrega un BookOdds a los markets[] existentes de un partido.
 * Dedup por (marketKey, bookmaker): si ya existe, mantiene el más reciente.
 */
function mergeBookOdds(markets, { marketKey, bookmaker, source, outcomes, updatedAt }) {
  let market = markets.find((m) => m.key === marketKey);
  if (!market) {
    const typeMap = {
      '1x2':  'match_winner', 'dc':   'double_chance',
      'btts':  'both_teams_score', 'dnb': 'draw_no_bet',
    };
    const type = typeMap[marketKey] ?? (marketKey.startsWith('ou') ? 'totals' : marketKey.startsWith('ah') ? 'asian_handicap' : 'match_winner');
    const line = marketKey.match(/[@](-?[\d.]+)/)?.[1];
    market = { key: marketKey, type, line: line ? Number(line) : null, books: [] };
    markets.push(market);
  }
  const existing = market.books.findIndex((b) => b.bookmaker === bookmaker);
  const entry    = { bookmaker, source, outcomes, updatedAt };
  if (existing >= 0) {
    if (new Date(updatedAt) >= new Date(market.books[existing].updatedAt)) {
      market.books[existing] = entry; // más reciente gana
    }
  } else {
    market.books.push(entry);
  }
}

/** Calcula consensus[] a partir de todos los BookOdds de cada mercado */
function computeConsensus(markets) {
  const consensus = {};
  for (const mkt of markets) {
    if (mkt.books.length === 0) continue;
    const outKeys = new Set(mkt.books.flatMap((b) => Object.keys(b.outcomes)));
    const outcomes = {};
    for (const key of outKeys) {
      const prices = mkt.books.map((b) => b.outcomes[key]).filter((p) => p > 1);
      if (prices.length === 0) continue;
      const best  = Math.max(...prices);
      const avg   = prices.reduce((s, p) => s + p, 0) / prices.length;
      const implied = 1 / avg;
      const bestBook = mkt.books.find((b) => b.outcomes[key] === best)?.bookmaker ?? 'unknown';
      outcomes[key] = { best, bestBook, avg: Number(avg.toFixed(3)), implied: Number(implied.toFixed(4)) };
    }
    // Overround de la línea media (suma de probabilidades implícitas)
    const impliedSum = Object.values(outcomes).reduce((s, o) => s + o.implied, 0);
    consensus[mkt.key] = { outcomes, bookCount: mkt.books.length, overround: Number(impliedSum.toFixed(4)) };
  }
  return consensus;
}

/** Extrae las cuotas legacy {home,draw,away,source} del consensus 1x2 o buildOdds */
export function pickPrimaryOdds(match) {
  const c = match.consensus?.['1x2'];
  if (c?.outcomes?.home?.avg && c?.outcomes?.draw?.avg && c?.outcomes?.away?.avg) {
    return {
      home:   Number(c.outcomes.home.best.toFixed(2)),
      draw:   Number(c.outcomes.draw.best.toFixed(2)),
      away:   Number(c.outcomes.away.best.toFixed(2)),
      source: 'market',
    };
  }
  return match.odds ?? buildOdds(match.home, match.away);
}

// ─── Fetch de cada fuente ─────────────────────────────────────────

async function fetchESPN() {
  try {
    const res = await apiFetch('/api/matches');
    return res?.events ?? [];
  } catch {
    return [];
  }
}

async function fetchWorldcup() {
  try {
    const res = await apiFetch('/api/worldcup');
    return (res?.ok && res.matches?.length) ? res : null;
  } catch {
    return null;
  }
}

async function fetchElo() {
  try {
    const res = await apiFetch('/api/elo');
    return res?.ratings ?? {};
  } catch {
    return {};
  }
}

async function fetchApifootball() {
  try {
    const res = await apiFetch('/api/apifootball');
    return res?.ok ? res : null;
  } catch {
    return null;
  }
}

async function fetchBalldontlie() {
  try {
    const res = await apiFetch('/api/balldontlie');
    return res?.ok ? res.games ?? [] : [];
  } catch {
    return [];
  }
}

async function fetchSGO() {
  try {
    const res = await apiFetch('/api/sportsgameodds');
    return res?.ok ? res.events ?? [] : [];
  } catch {
    return [];
  }
}

async function fetchOddsPapi() {
  try {
    const res = await apiFetch('/api/oddspapi');
    return res?.ok ? res.events ?? [] : [];
  } catch {
    return [];
  }
}

// ─── Algoritmo de fusión ──────────────────────────────────────────

function buildBaseMatches(worldcupData) {
  if (!worldcupData) {
    // Fallback local: ESPN cubrirá hoy; schedule estático cubre futuro
    return normalizeStaticSchedule();
  }

  const now = new Date();
  return worldcupData.matches.map((m, i) => {
    const homeTeam = resolveTeam(m.home.code) ?? resolveTeam(m.home.name) ?? { code: m.home.code ?? `H${i}`, name: m.home.name ?? '', flag: '⚽', rank: 50, form: '', avgGF: 1.2, avgGA: 1.2, cleanSheets: 1 };
    const awayTeam = resolveTeam(m.away.code) ?? resolveTeam(m.away.name) ?? { code: m.away.code ?? `A${i}`, name: m.away.name ?? '', flag: '⚽', rank: 50, form: '', avgGF: 1.2, avgGA: 1.2, cleanSheets: 1 };

    const odds = buildOdds(homeTeam, awayTeam);
    return {
      id:        m.id,
      sourceIds: { worldcup: m.id },
      stage:     m.stage ?? 'group',
      group:     m.group,
      matchday:  m.matchday,
      status:    m.status ?? 'upcoming',
      minute:    null,
      kickoff:   m.kickoff,
      venue:     m.venue ?? null,
      home:      { ...homeTeam, score: m.home.score },
      away:      { ...awayTeam, score: m.away.score },
      score:     { home: m.home.score, away: m.away.score },
      markets:   [],
      consensus: {},
      odds,
      volatility: 0,
      meta:      { lastUpdated: now.toISOString(), dataSources: ['worldcup'], freshness: { schedule: now.toISOString() }, oddsAreModel: true },
      dataSource: 'worldcup',
    };
  });
}

/** Sobrescribe status/score/minute de un partido base con datos ESPN en vivo */
function overlayESPN(matches, espnEvents) {
  const espnMap = {};
  for (const ev of espnEvents) {
    const norm = normalizeESPNEvent(ev);
    if (norm) {
      const key = pairKey(norm.home.code, norm.away.code);
      espnMap[key] = norm;
    }
  }

  const covered = new Set();
  const result  = matches.map((m) => {
    const key  = pairKey(m.home.code, m.away.code);
    const live = espnMap[key];
    if (!live) return m;
    covered.add(key);
    return {
      ...m,
      sourceIds: { ...m.sourceIds, espn: live.id },
      status:    live.status,
      minute:    live.minute,
      group:     live.group ?? m.group,
      score:     live.score,
      home:      { ...m.home, score: live.home.score },
      away:      { ...m.away, score: live.away.score },
      meta:      { ...m.meta, dataSources: [...new Set([...m.meta.dataSources, 'espn'])], freshness: { ...m.meta.freshness, live: new Date().toISOString() } },
      dataSource: m.dataSource === 'schedule' ? 'espn+schedule' : 'espn',
    };
  });

  // Añadir partidos de ESPN que no estaban en el calendario base
  for (const [key, live] of Object.entries(espnMap)) {
    if (!covered.has(key)) {
      result.push({ ...live });
    }
  }

  return result;
}

/** Añade datos Elo a los TeamRef de cada partido */
function overlayElo(matches, eloRatings) {
  if (!eloRatings || Object.keys(eloRatings).length === 0) return matches;
  const now = new Date().toISOString();
  return matches.map((m) => {
    const eloH = eloRatings[m.home.code];
    const eloA = eloRatings[m.away.code];
    return {
      ...m,
      home: eloH ? { ...m.home, elo: { rating: eloH.rating, rank: eloH.rank, updatedAt: eloH.updatedAt ?? now } } : m.home,
      away: eloA ? { ...m.away, elo: { rating: eloA.rating, rank: eloA.rank, updatedAt: eloA.updatedAt ?? now } } : m.away,
      meta: { ...m.meta, dataSources: [...new Set([...m.meta.dataSources, 'elo'])], freshness: { ...m.meta.freshness, elo: now } },
    };
  });
}

/** Añade form/stats de API-Football a los TeamRef */
function overlayApifootball(matches, apifb) {
  if (!apifb) return matches;
  const { teamMeta = {} } = apifb;
  const now = new Date().toISOString();
  return matches.map((m) => {
    const mH = teamMeta[m.home.code];
    const mA = teamMeta[m.away.code];
    const updH = mH ? {
      form:        mH.form ?? m.home.form,
      avgGF:       mH.avgGF ?? m.home.avgGF,
      avgGA:       mH.avgGA ?? m.home.avgGA,
      cleanSheets: mH.cleanSheets ?? m.home.cleanSheets,
      stats:       { avgGF: mH.avgGF, avgGA: mH.avgGA, cleanSheets: mH.cleanSheets, played: mH.played },
    } : {};
    const updA = mA ? {
      form:        mA.form ?? m.away.form,
      avgGF:       mA.avgGF ?? m.away.avgGF,
      avgGA:       mA.avgGA ?? m.away.avgGA,
      cleanSheets: mA.cleanSheets ?? m.away.cleanSheets,
      stats:       { avgGF: mA.avgGF, avgGA: mA.avgGA, cleanSheets: mA.cleanSheets, played: mA.played },
    } : {};
    if (Object.keys(updH).length === 0 && Object.keys(updA).length === 0) return m;
    return {
      ...m,
      home: { ...m.home, ...updH },
      away: { ...m.away, ...updA },
      meta: { ...m.meta, dataSources: [...new Set([...m.meta.dataSources, 'apifootball'])], freshness: { ...m.meta.freshness, meta: now } },
    };
  });
}

/**
 * Funde todos los eventos de odds (SGO + OddsPapi + BDL) en los markets[]
 * de los partidos correspondientes (matching por pairKey de nombres).
 */
function overlayOdds(matches, sgoEvents, opEvents, bdlGames) {
  // Construye lookup: pairKey → match index
  const matchIndex = {};
  for (let i = 0; i < matches.length; i++) {
    matchIndex[pairKey(matches[i].home.code, matches[i].away.code)] = i;
  }

  const now = new Date().toISOString();

  function processEvents(events, sourceLabel, extractBooks) {
    for (const ev of events) {
      const homeTeam = resolveTeam(ev.home?.name ?? '');
      const awayTeam = resolveTeam(ev.away?.name ?? '');
      if (!homeTeam || !awayTeam) continue;
      const key = pairKey(homeTeam.code, awayTeam.code);
      const idx = matchIndex[key];
      if (idx == null) continue;

      const books = extractBooks(ev);
      for (const b of books) {
        mergeBookOdds(matches[idx].markets, { ...b, source: sourceLabel, updatedAt: b.updatedAt ?? now });
      }
    }
  }

  // SGO: cada evento tiene markets[]
  processEvents(sgoEvents, 'sgo', (ev) =>
    (ev.markets ?? []).map((b) => ({
      marketKey: b.key, bookmaker: b.bookmaker ?? 'sgo', outcomes: b.outcomes,
    }))
  );

  // OddsPapi: cada evento tiene books[] con {marketKey, bookmaker, outcomes}
  processEvents(opEvents, 'oddspapi', (ev) =>
    (ev.books ?? []).map((b) => ({
      marketKey: b.marketKey, bookmaker: b.bookmaker ?? 'oddspapi', outcomes: b.outcomes,
    }))
  );

  // BDL: si trae odds en el objeto game directamente
  processEvents(bdlGames, 'balldontlie', (g) => {
    if (!g.odds) return [];
    const outcomes = {};
    const o = g.odds;
    if (o.home != null)  outcomes.home = Number(o.home);
    if (o.draw != null)  outcomes.draw = Number(o.draw);
    if (o.away != null)  outcomes.away = Number(o.away);
    return Object.keys(outcomes).length > 0
      ? [{ marketKey: '1x2', bookmaker: 'balldontlie', outcomes }]
      : [];
  });

  // Tras fusionar odds reales: recalcula consensus y actualiza legacy odds
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].markets.length === 0) continue;
    matches[i].consensus  = computeConsensus(matches[i].markets);
    matches[i].odds       = pickPrimaryOdds(matches[i]);
    matches[i].meta       = { ...matches[i].meta, oddsAreModel: matches[i].odds.source === 'model', dataSources: [...new Set([...matches[i].meta.dataSources, 'odds'])] };
  }

  // Para los que siguen sin odds reales: sintetizar modelo 1x2
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].markets.length === 0) {
      const modelOdds = buildOdds(matches[i].home, matches[i].away);
      const updatedAt = now;
      const bookEntry = { bookmaker: 'model', source: 'model', outcomes: { home: modelOdds.home, draw: modelOdds.draw, away: modelOdds.away }, updatedAt };
      mergeBookOdds(matches[i].markets, { marketKey: '1x2', ...bookEntry });
      matches[i].consensus = computeConsensus(matches[i].markets);
      matches[i].odds      = modelOdds;
    }
  }

  return matches;
}

/** Filtro de partidos duplicados (por pairKey) y muy antiguos (>24 h terminados) */
function dedupeAndFilter(matches) {
  const cutoff = new Date(Date.now() - 24 * 3600_000);
  const seen   = new Set();
  return matches.filter((m) => {
    if (m.status === 'finished' && new Date(m.kickoff ?? 0) < cutoff) return false;
    const key = pairKey(m.home.code, m.away.code);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Interfaz pública ─────────────────────────────────────────────

const START = Date.now();

/**
 * Obtiene y funde los partidos del Mundial 2026.
 * Llama a todos los /api/* en paralelo y une los resultados.
 */
export async function getLiveMatches() {
  const now = Date.now();

  // Fetch en paralelo de todas las fuentes
  const [
    espnEvents,
    worldcupData,
    eloRatings,
    apifbData,
    bdlGames,
    sgoEvents,
    opEvents,
  ] = await Promise.all([
    fetchESPN(),
    fetchWorldcup(),
    fetchElo(),
    fetchApifootball(),
    fetchBalldontlie(),
    fetchSGO(),
    fetchOddsPapi(),
  ]);

  // Loguea qué fuentes respondieron (visible en Vercel logs del navegador)
  const sources = {
    espn:         espnEvents.length > 0,
    worldcup:     worldcupData?.ok === true,
    elo:          Object.keys(eloRatings).length > 0,
    apifootball:  apifbData?.ok === true,
    balldontlie:  bdlGames.length > 0,
    sgo:          sgoEvents.length > 0,
    oddspapi:     opEvents.length > 0,
  };
  console.info('[dataFusion] fuentes activas:', JSON.stringify(sources), `(${Date.now() - now}ms)`);

  // 1. Base: calendario maestro (rezarahiminia) o fallback estático
  let matches = buildBaseMatches(worldcupData);

  // 2. Overlay: datos en vivo de ESPN
  matches = overlayESPN(matches, espnEvents);

  // 3. Overlay: ratings Elo
  matches = overlayElo(matches, eloRatings);

  // 4. Overlay: form/stats de API-Football
  matches = overlayApifootball(matches, apifbData);

  // 5. Fusión de odds (SGO + OddsPapi + BDL); genera consensus[] y actualiza odds legacy
  matches = overlayOdds(matches, sgoEvents, opEvents, bdlGames);

  // 6. Filtrar duplicados y partidos muy viejos; ordenar por relevancia
  matches = dedupeAndFilter(matches);

  // Filtrar fixtures futuros del calendario estático que ya están en live/worldcup
  // (los pairKeys ya los deduplicamos arriba)

  // Ordenar: vivo → próximo → finalizado; dentro de cada grupo, por kickoff
  const ORDER = { live: 0, upcoming: 1, finished: 2 };
  matches.sort((a, b) => {
    const sd = (ORDER[a.status] ?? 1) - (ORDER[b.status] ?? 1);
    if (sd !== 0) return sd;
    return new Date(a.kickoff ?? 0) - new Date(b.kickoff ?? 0);
  });

  return matches;
}

export function getProviderInfo() {
  return {
    provider: 'fusion',
    isDemo:   false,
    label:    'ESPN · datos reales',
  };
}
