/**
 * api/apifootball.js — Vercel Edge Function
 * ─────────────────────────────────────────────────────────────────
 * Proxy hacia API-Football v3 (api-sports.io).
 * Devuelve fixtures + standings de FIFA World Cup 2026.
 * Clave: API_FOOTBALL_KEY (server-side, sin prefijo VITE_).
 * Cache: 2 horas (estadísticas/forma cambian lentamente).
 * Cuota: 100 req/día → el CDN edge absorbe el tráfico.
 */
export const config = { runtime: 'edge' };

const BASE    = 'https://v3.football.api-sports.io';
const LEAGUE  = 1;    // FIFA World Cup
const SEASON  = 2026;
const TIMEOUT = 8000;

function getKey() {
  return process.env.API_FOOTBALL_KEY ?? '';
}

async function apiFetch(path) {
  const key = getKey();
  if (!key) return null;

  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'x-apisports-key': key },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    const json = await res.json();
    // API-Football envuelve en { response: [...], errors: {...} }
    if (json.errors && Object.keys(json.errors).length > 0) return null;
    return json.response ?? null;
  } catch {
    clearTimeout(tid);
    return null;
  }
}

/** Normaliza estado API-Football → status canónico */
function normalizeStatus(short = '') {
  if (['1H','2H','ET','P','BT','LIVE'].includes(short)) return 'live';
  if (['FT','AET','PEN'].includes(short))               return 'finished';
  return 'upcoming';
}

export default async function handler() {
  const key = getKey();
  const now = new Date();

  if (!key) {
    return new Response(
      JSON.stringify({ ok: false, reason: 'no-key', fixtures: [], standings: [], timestamp: now.toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60' } }
    );
  }

  // Fetch fixtures y standings en paralelo (2 requests de la cuota diaria)
  const [fixturesRaw, standingsRaw] = await Promise.all([
    apiFetch(`/fixtures?league=${LEAGUE}&season=${SEASON}`),
    apiFetch(`/standings?league=${LEAGUE}&season=${SEASON}`),
  ]);

  // ── Fixtures ────────────────────────────────────────────────────
  const fixtures = (fixturesRaw ?? []).map((fx) => {
    const f  = fx.fixture ?? {};
    const t  = fx.teams   ?? {};
    const g  = fx.goals   ?? {};
    const l  = fx.league  ?? {};

    const status = normalizeStatus(f.status?.short ?? '');
    const homeCode = (t.home?.name ?? '').slice(0, 3).toUpperCase();
    const awayCode = (t.away?.name ?? '').slice(0, 3).toUpperCase();

    return {
      id:        String(f.id ?? ''),
      kickoff:   f.date ?? null,
      status,
      minute:    f.status?.elapsed ?? null,
      group:     l.round?.replace(/^Group - /, '') ?? null, // "Group - A" → "A"
      home: {
        name:    t.home?.name ?? '',
        code:    homeCode,
        score:   g.home ?? null,
        fifaRank: null, // API-Football no devuelve rank FIFA aquí
      },
      away: {
        name:    t.away?.name ?? '',
        code:    awayCode,
        score:   g.away ?? null,
        fifaRank: null,
      },
    };
  });

  // ── Standings / forma ───────────────────────────────────────────
  const teamMeta = {};
  const allGroups = standingsRaw?.[0]?.league?.standings ?? [];
  for (const group of allGroups) {
    const groupId = (group[0]?.group ?? '').replace(/^Group /, ''); // "Group A" → "A"
    for (const entry of group) {
      const name = entry.team?.name ?? '';
      const code = name.slice(0, 3).toUpperCase();
      teamMeta[code] = {
        name,
        form:        entry.form ?? null,          // "WWDLW"
        played:      entry.all?.played  ?? null,
        avgGF:       entry.all?.goals?.for   != null ? (entry.all.goals.for   / (entry.all.played || 1)) : null,
        avgGA:       entry.all?.goals?.against != null ? (entry.all.goals.against / (entry.all.played || 1)) : null,
        cleanSheets: entry.all?.clean_sheet ?? null,
        group:       groupId,
      };
    }
  }

  return new Response(
    JSON.stringify({ ok: true, fixtures, teamMeta, timestamp: now.toISOString() }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=900' } }
  );
}
