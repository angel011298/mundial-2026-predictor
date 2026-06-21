/**
 * api/oddspapi.js — Vercel Edge Function
 * ─────────────────────────────────────────────────────────────────
 * Proxy hacia OddsPapi — la fuente de odds más limitada (250 req/mes).
 * CUOTA CRÍTICA: cache de 12 h (s-maxage=43200) para usar solo 2×/día.
 * El CDN edge sirve el cache; la API solo se llama cuando el cache expira.
 * Clave: ODDSPAPI_API_KEY (server-side).
 *
 * NOTA: Endpoints verificables en https://oddspapi.com/docs una vez activa la clave.
 */
export const config = { runtime: 'edge' };

const TIMEOUT = 8000;

function getKey() {
  return process.env.ODDSPAPI_API_KEY ?? '';
}

async function opFetch(url, headers = {}) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers: { 'Accept': 'application/json', ...headers }, signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? json.events ?? json.results ?? json;
  } catch {
    clearTimeout(tid);
    return null;
  }
}

/** Normaliza clave de mercado OddsPapi → canónico */
function normalizeMarketKey(raw = '') {
  const r = raw.toLowerCase();
  if (r === 'h2h' || r === '1x2' || r === 'match_winner') return '1x2';
  if (r.includes('double_chance'))  return 'dc';
  if (r.includes('btts') || r.includes('both_teams')) return 'btts';
  if (r.includes('totals') || r.includes('over_under')) {
    const line = raw.match(/[\d.]+/)?.[0];
    return line ? `ou@${line}` : 'ou@2.5';
  }
  if (r.includes('asian_handicap')) return 'ah@0';
  if (r.includes('draw_no_bet'))    return 'dnb';
  return r.replace(/\s+/g, '_');
}

export default async function handler() {
  const key = getKey();
  const now = new Date();

  if (!key) {
    return new Response(
      JSON.stringify({ ok: false, reason: 'no-key', events: [], timestamp: now.toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60' } }
    );
  }

  // OddsPapi endpoints (verificar en docs con la clave activa)
  // Intentamos los patrones más comunes de odds APIs para WC 2026
  const headers = { 'x-api-key': key };
  let raw =
    await opFetch('https://api.oddspapi.com/v1/odds?sport=soccer&league=FIFA+World+Cup&season=2026&oddsFormat=decimal', headers) ??
    await opFetch(`https://api.oddspapi.com/odds?sport=soccer&league=FIFA%20World%20Cup&apiKey=${key}`) ??
    await opFetch(`https://api.oddspapi.com/v2/events?sport=soccer&competition=fifa_world_cup`, headers);

  if (!raw || (Array.isArray(raw) && raw.length === 0)) {
    return new Response(
      JSON.stringify({ ok: false, reason: 'no-data', events: [], timestamp: now.toISOString() }),
      // Si no hay datos, cachear 1 h (no re-intentar inmediatamente y consumir cuota)
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=3600' } }
    );
  }

  const updatedAt = now.toISOString();
  const events = (Array.isArray(raw) ? raw : []).map((ev) => {
    const homeTeam = ev.home_team ?? ev.home ?? ev.teams?.home ?? {};
    const awayTeam = ev.away_team ?? ev.away ?? ev.teams?.away ?? {};

    // Recopila BookOdds de TODOS los bookmakers que OddsPapi devuelva
    const allBooks = [];
    const bookmakers = ev.bookmakers ?? ev.odds ?? [];

    for (const bk of (Array.isArray(bookmakers) ? bookmakers : [])) {
      const bookmakerName = bk.key ?? bk.bookmaker ?? bk.name ?? 'unknown';
      const bkMarkets     = bk.markets ?? bk.odds ?? [];
      for (const mkt of (Array.isArray(bkMarkets) ? bkMarkets : [])) {
        const marketKey = normalizeMarketKey(mkt.key ?? mkt.market ?? '');
        const outcomes  = {};
        for (const outcome of (mkt.outcomes ?? [])) {
          const name  = (outcome.name ?? '').toLowerCase();
          const price = Number(outcome.price ?? outcome.odds ?? 0);
          if (name === 'home' || name === '1') outcomes.home = price;
          else if (name === 'draw' || name === 'x') outcomes.draw = price;
          else if (name === 'away' || name === '2') outcomes.away = price;
          else if (name === 'over')  outcomes.over = price;
          else if (name === 'under') outcomes.under = price;
          else outcomes[name] = price;
        }
        if (Object.keys(outcomes).length > 0) {
          allBooks.push({ marketKey, bookmaker: bookmakerName, source: 'oddspapi', outcomes, updatedAt });
        }
      }
    }

    return {
      id:      String(ev.id ?? ev.event_id ?? ''),
      kickoff: ev.commence_time ?? ev.date ?? ev.start_time ?? null,
      home:    { name: typeof homeTeam === 'string' ? homeTeam : (homeTeam.name ?? '') },
      away:    { name: typeof awayTeam === 'string' ? awayTeam : (awayTeam.name ?? '') },
      books:   allBooks,
    };
  });

  return new Response(
    JSON.stringify({ ok: true, events, timestamp: updatedAt }),
    {
      headers: {
        'Content-Type': 'application/json',
        // 12 horas: ~2 llamadas reales/día al CDN expira → protege cuota 250/mes
        'Cache-Control': 'public, s-maxage=43200, stale-while-revalidate=7200',
      },
    }
  );
}
