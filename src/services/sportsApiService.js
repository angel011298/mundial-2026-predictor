/**
 * sportsApiService.js
 * ───────────────────────────────────────────────────────────────
 * Capa de acceso a datos deportivos. Expone una interfaz ÚNICA y
 * estable al resto de la app:
 *
 *     getLiveMatches()  → Promise<Match[]>
 *
 * Internamente decide el proveedor según VITE_DATA_PROVIDER:
 *   - "mock"          → datos simulados realistas (sin clave, modo DEMO)
 *   - "odds-api"      → The Odds API   (cuotas en vivo)
 *   - "api-football"  → API-Football   (marcadores + estadísticas)
 *
 * Todos los proveedores devuelven el MISMO esquema normalizado `Match`,
 * de modo que el motor de consejos y la UI no cambian al cambiar de API.
 *
 * Esquema Match:
 * {
 *   id, group, status: 'live'|'upcoming'|'finished', minute, kickoff,
 *   home: { name, code, flag, score, rank, form, avgGF, avgGA, cleanSheets },
 *   away: { ...idem },
 *   odds: { home, draw, away },   // cuotas decimales
 *   volatility                    // 0..1, movimiento reciente de cuota
 * }
 */

import worldcup from '../data/worldcup2026.json';

const PROVIDER = import.meta.env.VITE_DATA_PROVIDER || 'mock';
const ODDS_API_KEY = import.meta.env.VITE_ODDS_API_KEY;
const API_FOOTBALL_KEY = import.meta.env.VITE_API_FOOTBALL_KEY;

// ───────────────────────────── Utilidades internas ─────────────────

const allTeams = worldcup.groups.flatMap((g) =>
  g.teams.map((t) => ({ ...t, group: g.id }))
);

const teamByCode = Object.fromEntries(allTeams.map((t) => [t.code, t]));

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

/** Genera cuotas decimales coherentes con la diferencia de ranking. */
function buildOdds(home, away) {
  // Rating simple invertido por ranking + ruido de mercado.
  const rh = 1 - Math.log10(home.rank ?? 50) / 2;
  const ra = 1 - Math.log10(away.rank ?? 50) / 2;
  const diff = rh - ra;

  const pHome = 1 / (1 + Math.exp(-3.2 * diff));
  const pDraw = Math.min(0.34, Math.max(0.16, 0.30 * (1 - Math.abs(diff))));
  const pHomeAdj = pHome * (1 - pDraw);
  const pAwayAdj = (1 - pHome) * (1 - pDraw);

  const margin = 1.06; // 6% overround típico de la casa
  const toOdds = (p) => Number((1 / (p * margin)).toFixed(2));
  return {
    home: Math.max(1.05, toOdds(pHomeAdj)),
    draw: Math.max(1.05, toOdds(pDraw)),
    away: Math.max(1.05, toOdds(pAwayAdj)),
  };
}

// ───────────────────────── Proveedor DEMO (mock) ───────────────────

/**
 * Construye un calendario plausible de la 1ª jornada de cada grupo
 * (equipos 1v2 y 3v4) y asigna estados live/upcoming/finished con
 * marcadores, minuto y volatilidad simulados. Cada llamada varía un
 * poco para que "ACTUALIZAR" se sienta en vivo.
 */
function generateMockMatches() {
  const fixtures = [];
  let id = 1;

  worldcup.groups.forEach((group) => {
    const [t1, t2, t3, t4] = group.teams;
    fixtures.push([t1, t2, group.id]);
    fixtures.push([t3, t4, group.id]);
  });

  const now = Date.now();

  return fixtures.map(([home, away, group], idx) => {
    // Distribuye estados: ~1/3 en vivo, ~1/3 próximos, ~1/3 finalizados.
    const bucket = (idx + Math.floor(now / 60000)) % 3;
    const status = bucket === 0 ? 'live' : bucket === 1 ? 'upcoming' : 'finished';

    let minute = null;
    let homeScore = null;
    let awayScore = null;

    if (status === 'live') {
      minute = Math.floor(rand(8, 88));
      homeScore = Math.random() < 0.6 ? Math.floor(rand(0, 3)) : 0;
      awayScore = Math.random() < 0.5 ? Math.floor(rand(0, 3)) : 0;
    } else if (status === 'finished') {
      homeScore = Math.floor(rand(0, 4));
      awayScore = Math.floor(rand(0, 3));
    }

    const kickoff =
      status === 'upcoming'
        ? new Date(now + rand(1, 48) * 3600 * 1000).toISOString()
        : new Date(now - rand(1, 6) * 3600 * 1000).toISOString();

    return {
      id: `mock-${id++}`,
      group,
      status,
      minute,
      kickoff,
      home: { ...home, score: homeScore },
      away: { ...away, score: awayScore },
      odds: buildOdds(home, away),
      volatility: Number(rand(0, 0.6).toFixed(2)),
    };
  });
}

// ─────────────────── Adaptador: The Odds API ───────────────────────
// Docs: https://the-odds-api.com/liveapi/guides/v4/
// Devuelve cuotas; los marcadores en vivo requieren el endpoint /scores.

async function fetchFromOddsApi() {
  if (!ODDS_API_KEY) throw new Error('Falta VITE_ODDS_API_KEY');

  // Deporte específico del Mundial cuando esté activo en el feed.
  const sportKey = 'soccer_fifa_world_cup';
  const base = 'https://api.the-odds-api.com/v4/sports';

  const oddsRes = await fetch(
    `${base}/${sportKey}/odds/?regions=eu&markets=h2h&oddsFormat=decimal&apiKey=${ODDS_API_KEY}`
  );
  if (!oddsRes.ok) throw new Error(`Odds API ${oddsRes.status}`);
  const events = await oddsRes.json();

  return events.map((ev) => normalizeOddsApiEvent(ev));
}

/** Mapea un evento de The Odds API → esquema Match. */
function normalizeOddsApiEvent(ev) {
  const market = ev.bookmakers?.[0]?.markets?.find((m) => m.key === 'h2h');
  const price = (name) =>
    market?.outcomes?.find((o) => o.name === name)?.price ?? null;

  const home = resolveTeam(ev.home_team);
  const away = resolveTeam(ev.away_team);

  return {
    id: ev.id,
    group: home.group || '—',
    status: 'upcoming', // /odds no trae marcador; usa /scores para 'live'
    minute: null,
    kickoff: ev.commence_time,
    home: { ...home, score: null },
    away: { ...away, score: null },
    odds: {
      home: price(ev.home_team),
      draw: price('Draw'),
      away: price(ev.away_team),
    },
    volatility: 0,
  };
}

// ─────────────────── Adaptador: API-Football ───────────────────────
// Docs: https://www.api-football.com/documentation-v3
// League 1 = FIFA World Cup. Filtra por season=2026.

async function fetchFromApiFootball() {
  if (!API_FOOTBALL_KEY) throw new Error('Falta VITE_API_FOOTBALL_KEY');

  const res = await fetch(
    'https://v3.football.api-sports.io/fixtures?league=1&season=2026&live=all',
    { headers: { 'x-apisports-key': API_FOOTBALL_KEY } }
  );
  if (!res.ok) throw new Error(`API-Football ${res.status}`);
  const json = await res.json();

  return (json.response || []).map((fx) => normalizeApiFootballFixture(fx));
}

/** Mapea un fixture de API-Football → esquema Match. */
function normalizeApiFootballFixture(fx) {
  const statusShort = fx.fixture?.status?.short;
  const status =
    statusShort === 'NS'
      ? 'upcoming'
      : ['FT', 'AET', 'PEN'].includes(statusShort)
        ? 'finished'
        : 'live';

  const home = resolveTeam(fx.teams?.home?.name);
  const away = resolveTeam(fx.teams?.away?.name);

  return {
    id: String(fx.fixture?.id),
    group: home.group || '—',
    status,
    minute: fx.fixture?.status?.elapsed ?? null,
    kickoff: fx.fixture?.date,
    home: { ...home, score: fx.goals?.home ?? null },
    away: { ...away, score: fx.goals?.away ?? null },
    // API-Football no entrega cuotas en este endpoint; combínalo con
    // /odds o con The Odds API. Mientras tanto, derivamos del rating.
    odds: buildOdds(home, away),
    volatility: 0,
  };
}

/**
 * Resuelve el nombre que devuelve la API a nuestra ficha local de equipo
 * (con bandera, ranking y stats). Si no hay match, crea uno mínimo.
 */
function resolveTeam(apiName = '') {
  const found = allTeams.find(
    (t) => t.name.toLowerCase() === apiName.toLowerCase()
  );
  if (found) return found;
  return {
    name: apiName || 'Por definir',
    code: apiName.slice(0, 3).toUpperCase(),
    flag: '⚽',
    rank: 50,
    form: '',
    avgGF: 1.2,
    avgGA: 1.2,
    cleanSheets: 1,
    group: '—',
  };
}

// ───────────────────────── Interfaz pública ────────────────────────

/**
 * Obtiene los partidos del Mundial 2026 ya normalizados.
 * Maneja errores con fallback a DEMO para que la UI nunca quede vacía.
 */
export async function getLiveMatches() {
  // Pequeña latencia simulada en DEMO para que el spinner sea visible.
  const withDemoLatency = (data) =>
    new Promise((resolve) => setTimeout(() => resolve(data), 650));

  try {
    if (PROVIDER === 'odds-api') return await fetchFromOddsApi();
    if (PROVIDER === 'api-football') return await fetchFromApiFootball();
    return await withDemoLatency(generateMockMatches());
  } catch (err) {
    console.warn(`[sportsApiService] Proveedor "${PROVIDER}" falló:`, err.message);
    console.warn('[sportsApiService] Usando datos DEMO como respaldo.');
    return await withDemoLatency(generateMockMatches());
  }
}

/** Metadatos del proveedor activo (para mostrar en la UI). */
export function getProviderInfo() {
  const isDemo = PROVIDER === 'mock' || (!ODDS_API_KEY && !API_FOOTBALL_KEY);
  return {
    provider: PROVIDER,
    isDemo,
    label: isDemo ? 'DEMO · datos simulados' : `EN VIVO · ${PROVIDER}`,
  };
}

export { teamByCode };
