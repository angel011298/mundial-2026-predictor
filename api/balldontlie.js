/**
 * api/balldontlie.js — Vercel Edge Function
 * ─────────────────────────────────────────────────────────────────
 * Proxy hacia BALLDONTLIE para datos de FIFA World Cup 2026.
 * NOTA: BALLDONTLIE es principalmente NBA; el endpoint de soccer/FIFA
 * puede no estar disponible en el plan actual. Degrada elegantemente.
 * Clave: BALLDONTLIE_API_KEY (server-side).
 * Cache: 2 horas. Cuota: 5 req/min → CDN edge lo absorbe.
 */
export const config = { runtime: 'edge' };

const BASE    = 'https://api.balldontlie.io/v1';
const TIMEOUT = 7000;

function getKey() {
  return process.env.BALLDONTLIE_API_KEY ?? '';
}

async function bdlFetch(path) {
  const key = getKey();
  if (!key) return null;
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? json;
  } catch {
    clearTimeout(tid);
    return null;
  }
}

/** Normaliza status de BALLDONTLIE → canónico */
function normalizeStatus(status = '') {
  const s = String(status).toLowerCase();
  if (s === 'in_progress' || s === 'live') return 'live';
  if (s === 'final' || s === 'ft'       ) return 'finished';
  return 'upcoming';
}

export default async function handler() {
  const key = getKey();
  const now = new Date();

  if (!key) {
    return new Response(
      JSON.stringify({ ok: false, reason: 'no-key', games: [], odds: [], timestamp: now.toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60' } }
    );
  }

  // Intentamos varios paths que BALLDONTLIE podría exponer para soccer/FIFA WC
  // (la documentación pública no confirma el endpoint exacto → try/fallback)
  let raw = await bdlFetch('/soccer/games?league=fifa_world_cup&season=2026');
  if (!raw || (Array.isArray(raw) && raw.length === 0)) {
    raw = await bdlFetch('/soccer/events?sport=soccer&league=FIFA%20World%20Cup&season=2026');
  }
  if (!raw || (Array.isArray(raw) && raw.length === 0)) {
    // No hay datos disponibles — devolvemos vacío para que el fusionador lo ignore
    return new Response(
      JSON.stringify({ ok: false, reason: 'no-data', games: [], odds: [], timestamp: now.toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=3600' } }
    );
  }

  const games = (Array.isArray(raw) ? raw : []).map((g) => {
    const homeScore = g.home_team_score ?? g.home_score ?? g.scores?.home ?? null;
    const awayScore = g.visitor_team_score ?? g.away_score ?? g.scores?.away ?? null;
    const status    = normalizeStatus(g.status ?? g.state ?? '');
    return {
      id:     String(g.id ?? ''),
      status,
      kickoff: g.date ?? g.datetime ?? g.start_time ?? null,
      home: { name: g.home_team?.full_name ?? g.home_team ?? '', score: homeScore != null ? Number(homeScore) : null },
      away: { name: g.visitor_team?.full_name ?? g.away_team ?? '', score: awayScore != null ? Number(awayScore) : null },
      // Odds si BALLDONTLIE las incluye en el mismo endpoint
      odds: g.odds ?? null,
    };
  });

  return new Response(
    JSON.stringify({ ok: true, games, timestamp: now.toISOString() }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=7200, stale-while-revalidate=900' } }
  );
}
