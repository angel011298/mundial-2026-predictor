/**
 * sportsApiService.js
 * ─────────────────────────────────────────────────────────────────
 * Capa de acceso a datos deportivos. Interfaz pública:
 *
 *   getLiveMatches()  →  Promise<Match[]>
 *
 * Proveedor activo según VITE_DATA_PROVIDER:
 *   "espn"         → ESPN API pública sin clave (PREDETERMINADO)
 *   "odds-api"     → The Odds API  (requiere VITE_ODDS_API_KEY)
 *   "api-football" → API-Football  (requiere VITE_API_FOOTBALL_KEY)
 *   "mock"         → Datos simulados (fallback automático)
 *
 * Todos los proveedores devuelven el mismo esquema Match normalizado.
 */

import worldcup from '../data/worldcup2026.json';

const PROVIDER      = import.meta.env.VITE_DATA_PROVIDER || 'espn';
const ODDS_API_KEY  = import.meta.env.VITE_ODDS_API_KEY;
const APIFB_KEY     = import.meta.env.VITE_API_FOOTBALL_KEY;

// ─── Datos locales de apoyo ───────────────────────────────────────

const allTeams = worldcup.groups.flatMap((g) =>
  g.teams.map((t) => ({ ...t, group: g.id }))
);

/** Mapeo de nombres ESPN (inglés) → nombre en nuestro JSON (español) */
const ESPN_NAME_MAP = {
  'Mexico': 'México',
  'Croatia': 'Croacia',
  'France': 'Francia',
  'Spain': 'España',
  'Netherlands': 'Países Bajos',
  'Germany': 'Alemania',
  'Belgium': 'Bélgica',
  'Switzerland': 'Suiza',
  'Morocco': 'Marruecos',
  'Ivory Coast': 'Costa de Marfil',
  "Cote d'Ivoire": 'Costa de Marfil',
  'Costa Rica': 'Costa Rica',
  'New Zealand': 'Nueva Zelanda',
  'Canada': 'Canadá',
  'Norway': 'Noruega',
  'Japan': 'Japón',
  'Jordan': 'Jordania',
  'United States': 'Estados Unidos',
  'USA': 'Estados Unidos',
  'Colombia': 'Colombia',
  'Australia': 'Australia',
  'Qatar': 'Catar',
  'Argentina': 'Argentina',
  'Nigeria': 'Nigeria',
  'England': 'Inglaterra',
  'Denmark': 'Dinamarca',
  'Serbia': 'Serbia',
  'Chile': 'Chile',
  'Brazil': 'Brasil',
  'South Korea': 'Corea del Sur',
  'Korea Republic': 'Corea del Sur',
  'Cameroon': 'Camerún',
  'Greece': 'Grecia',
  'Portugal': 'Portugal',
  'Iran': 'Irán',
  'Ghana': 'Ghana',
  'Ukraine': 'Ucrania',
  'Ecuador': 'Ecuador',
  'Algeria': 'Argelia',
  'Poland': 'Polonia',
  'Italy': 'Italia',
  'Turkey': 'Turquía',
  'Tunisia': 'Túnez',
  'Saudi Arabia': 'Arabia Saudita',
  'Paraguay': 'Paraguay',
  'Uruguay': 'Uruguay',
  'Senegal': 'Senegal',
  'Austria': 'Austria',
  'Peru': 'Perú',
  'Panama': 'Panamá',
};

// ─── Utilidades internas ──────────────────────────────────────────

function rand(min, max) { return Math.random() * (max - min) + min; }

/** Resuelve nombre (API) → ficha completa del equipo del JSON local */
function resolveTeam(apiName = '') {
  // 1. Mapeo ESPN directo
  const mapped = ESPN_NAME_MAP[apiName] || apiName;
  // 2. Buscar por nombre exacto o aproximado (sin acentos)
  const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const found = allTeams.find(
    (t) => normalize(t.name) === normalize(mapped) || normalize(t.name) === normalize(apiName)
  );
  if (found) return found;
  return {
    name: mapped || 'Por definir',
    code: (mapped || apiName).slice(0, 3).toUpperCase(),
    flag: '⚽',
    rank: 50,
    form: '',
    avgGF: 1.2,
    avgGA: 1.2,
    cleanSheets: 1,
    group: '—',
  };
}

/** Cuotas decimales estimadas desde ranking FIFA + forma */
function buildOdds(home, away) {
  const rh = 1 - Math.log10(home.rank ?? 50) / 2;
  const ra = 1 - Math.log10(away.rank ?? 50) / 2;
  const diff = rh - ra;
  const pHome = 1 / (1 + Math.exp(-3.2 * diff));
  const pDraw = Math.min(0.34, Math.max(0.16, 0.30 * (1 - Math.abs(diff))));
  const pHomeAdj = pHome * (1 - pDraw);
  const pAwayAdj = (1 - pHome) * (1 - pDraw);
  const margin = 1.06;
  const toOdds = (p) => Number((1 / (p * margin)).toFixed(2));
  return {
    home: Math.max(1.05, toOdds(pHomeAdj)),
    draw: Math.max(1.05, toOdds(pDraw)),
    away: Math.max(1.05, toOdds(pAwayAdj)),
    source: 'model', // etiqueta: cuotas estimadas, no de una casa de apuestas
  };
}

// ─── Proveedor ESPN (datos reales, sin clave) ─────────────────────

/**
 * Llama a nuestro Edge Function /api/matches que hace el proxy
 * server-side hacia ESPN (evita CORS y esconde el origen al cliente).
 */
async function fetchFromESPN() {
  const res = await fetch('/api/matches');
  if (!res.ok) throw new Error(`/api/matches respondió ${res.status}`);
  const { events, source } = await res.json();

  if (!events || events.length === 0) {
    throw new Error('ESPN no devolvió partidos (posiblemente no hay jornada activa hoy)');
  }

  return events.map(normalizeESPNEvent).filter(Boolean);
}

/** Convierte un evento ESPN → esquema Match normalizado */
function normalizeESPNEvent(ev) {
  const comp = ev.competitions?.[0];
  if (!comp) return null;

  const homeC = comp.competitors?.find((c) => c.homeAway === 'home');
  const awayC = comp.competitors?.find((c) => c.homeAway === 'away');
  if (!homeC || !awayC) return null;

  const statusName = comp.status?.type?.name ?? '';
  const status =
    statusName === 'STATUS_IN_PROGRESS' ? 'live'
    : ['STATUS_FINAL', 'STATUS_FULL_TIME', 'STATUS_FINAL_AET', 'STATUS_FINAL_PEN'].includes(statusName) ? 'finished'
    : 'upcoming';

  // Minuto en vivo (ESPN entrega el reloj como string "45'")
  const clock = comp.status?.displayClock ?? '';
  const minute = status === 'live' ? parseInt(clock) || null : null;

  const homeTeam = resolveTeam(homeC.team?.displayName ?? homeC.team?.name ?? '');
  const awayTeam = resolveTeam(awayC.team?.displayName ?? awayC.team?.name ?? '');

  const homeScore = status !== 'upcoming' ? (parseInt(homeC.score) ?? null) : null;
  const awayScore = status !== 'upcoming' ? (parseInt(awayC.score) ?? null) : null;

  return {
    id: String(ev.id),
    group: homeTeam.group || '—',
    status,
    minute,
    kickoff: ev.date,
    home: { ...homeTeam, score: homeScore },
    away: { ...awayTeam, score: awayScore },
    odds: buildOdds(homeTeam, awayTeam),
    volatility: 0,
    dataSource: 'espn', // marcador para la UI
  };
}

// ─── Proveedor The Odds API ───────────────────────────────────────

async function fetchFromOddsApi() {
  if (!ODDS_API_KEY) throw new Error('Falta VITE_ODDS_API_KEY');
  const sportKey = 'soccer_fifa_world_cup';
  const res = await fetch(
    `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?regions=eu&markets=h2h&oddsFormat=decimal&apiKey=${ODDS_API_KEY}`
  );
  if (!res.ok) throw new Error(`Odds API ${res.status}`);
  return (await res.json()).map(normalizeOddsApiEvent);
}

function normalizeOddsApiEvent(ev) {
  const market = ev.bookmakers?.[0]?.markets?.find((m) => m.key === 'h2h');
  const price = (name) => market?.outcomes?.find((o) => o.name === name)?.price ?? null;
  const home = resolveTeam(ev.home_team);
  const away = resolveTeam(ev.away_team);
  return {
    id: ev.id,
    group: home.group || '—',
    status: 'upcoming',
    minute: null,
    kickoff: ev.commence_time,
    home: { ...home, score: null },
    away: { ...away, score: null },
    odds: { home: price(ev.home_team), draw: price('Draw'), away: price(ev.away_team), source: 'market' },
    volatility: 0,
    dataSource: 'odds-api',
  };
}

// ─── Proveedor API-Football ───────────────────────────────────────

async function fetchFromApiFootball() {
  if (!APIFB_KEY) throw new Error('Falta VITE_API_FOOTBALL_KEY');
  const res = await fetch(
    'https://v3.football.api-sports.io/fixtures?league=1&season=2026&live=all',
    { headers: { 'x-apisports-key': APIFB_KEY } }
  );
  if (!res.ok) throw new Error(`API-Football ${res.status}`);
  const json = await res.json();
  return (json.response || []).map(normalizeApiFootballFixture);
}

function normalizeApiFootballFixture(fx) {
  const st = fx.fixture?.status?.short;
  const status = st === 'NS' ? 'upcoming'
    : ['FT','AET','PEN'].includes(st) ? 'finished' : 'live';
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
    odds: buildOdds(home, away),
    volatility: 0,
    dataSource: 'api-football',
  };
}

// ─── Proveedor DEMO (simulado) ────────────────────────────────────

function generateMockMatches() {
  const now = Date.now();
  let id = 1;

  return worldcup.groups.flatMap((group) => {
    const [t1, t2, t3, t4] = group.teams;
    return [[t1, t2], [t3, t4]].map(([home, away]) => {
      const bucket = (id + Math.floor(now / 60000)) % 3;
      const status = bucket === 0 ? 'live' : bucket === 1 ? 'upcoming' : 'finished';
      const homeScore = status !== 'upcoming' ? Math.floor(rand(0, 3)) : null;
      const awayScore = status !== 'upcoming' ? Math.floor(rand(0, 2)) : null;
      return {
        id: `mock-${id++}`,
        group: group.id,
        status,
        minute: status === 'live' ? Math.floor(rand(10, 88)) : null,
        kickoff: new Date(now + (status === 'upcoming' ? rand(1, 48) : -rand(1, 6)) * 3600000).toISOString(),
        home: { ...home, score: homeScore },
        away: { ...away, score: awayScore },
        odds: { ...buildOdds(home, away), source: 'model' },
        volatility: Number(rand(0, 0.6).toFixed(2)),
        dataSource: 'demo',
      };
    });
  });
}

// ─── Interfaz pública ─────────────────────────────────────────────

/**
 * Obtiene partidos del Mundial 2026 normalizados.
 * Si el proveedor elegido falla, cae automáticamente a datos demo.
 */
export async function getLiveMatches() {
  const demoDelay = (data) =>
    new Promise((r) => setTimeout(() => r(data), 650));

  try {
    if (PROVIDER === 'espn')          return await fetchFromESPN();
    if (PROVIDER === 'odds-api')      return await fetchFromOddsApi();
    if (PROVIDER === 'api-football')  return await fetchFromApiFootball();
    return await demoDelay(generateMockMatches());
  } catch (err) {
    console.warn(`[sportsApiService] "${PROVIDER}" falló (${err.message}) → usando datos DEMO.`);
    return await demoDelay(generateMockMatches());
  }
}

export function getProviderInfo() {
  const isDemo = PROVIDER === 'mock';
  const labels = {
    espn: 'ESPN · datos reales',
    'odds-api': 'The Odds API · datos reales',
    'api-football': 'API-Football · datos reales',
    mock: 'DEMO · datos simulados',
  };
  return {
    provider: PROVIDER,
    isDemo,
    label: labels[PROVIDER] ?? `${PROVIDER} · activo`,
  };
}
