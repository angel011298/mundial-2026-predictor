/**
 * api/sportsgameodds.js — Vercel Edge Function
 * ─────────────────────────────────────────────────────────────────
 * Proxy hacia SportsGameOdds API.
 * Devuelve eventos de soccer / FIFA World Cup con odds multi-mercado.
 * Clave: SPORTSGAMEODDS_API_KEY (server-side).
 * Cache: 3 horas.
 *
 * NOTA: Los endpoints exactos deben verificarse una vez activada la clave.
 * Docs: https://sportsgameodds.com/docs/
 */
export const config = { runtime: 'edge' };

const BASE    = 'https://api.sportsgameodds.com/v2';
const TIMEOUT = 7000;

function getKey() {
  return process.env.SPORTSGAMEODDS_API_KEY ?? '';
}

async function sgoFetch(path) {
  const key = getKey();
  if (!key) return null;
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'X-Api-Key': key, 'Accept': 'application/json' },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? json.events ?? json.results ?? json;
  } catch {
    clearTimeout(tid);
    return null;
  }
}

/** Normaliza clave de mercado al esquema canónico */
function normalizeMarketKey(raw = '') {
  const r = raw.toLowerCase();
  if (r.includes('moneyline') || r.includes('1x2') || r.includes('match_winner')) return '1x2';
  if (r.includes('double_chance') || r.includes('dc'))  return 'dc';
  if (r.includes('both_teams')    || r.includes('btts')) return 'btts';
  if (r.includes('over_under')    || r.includes('total') || r.includes('ou')) {
    const line = raw.match(/[\d.]+/)?.[0];
    return line ? `ou@${line}` : 'ou@2.5';
  }
  if (r.includes('asian')  || r.includes('handicap') || r.includes('ah')) return 'ah@0';
  if (r.includes('draw_no_bet') || r.includes('dnb'))  return 'dnb';
  return r.replace(/\s+/g, '_');
}

/** Extrae outcomes de un evento SGO para un mercado dado */
function extractOutcomes(mkt) {
  const outcomes = {};
  const odds = mkt.odds ?? mkt.outcomes ?? mkt.prices ?? {};

  if (Array.isArray(odds)) {
    for (const o of odds) {
      const label = (o.name ?? o.label ?? o.outcome ?? '').toLowerCase();
      const price = Number(o.price ?? o.odds ?? o.decimal ?? 0);
      if (label.includes('home') || label === '1') outcomes.home = price;
      else if (label.includes('draw') || label === 'x') outcomes.draw = price;
      else if (label.includes('away') || label === '2') outcomes.away = price;
      else if (label.includes('over'))                  outcomes.over = price;
      else if (label.includes('under'))                 outcomes.under = price;
      else if (label === 'yes')                         outcomes.yes = price;
      else if (label === 'no')                          outcomes.no  = price;
      else outcomes[label] = price;
    }
  } else {
    // Objeto plano { home, draw, away } o { 1, x, 2 }
    if (odds['1'] != null) outcomes.home = Number(odds['1']);
    if (odds['x'] != null || odds['X'] != null) outcomes.draw = Number(odds['x'] ?? odds['X']);
    if (odds['2'] != null) outcomes.away = Number(odds['2']);
    if (odds.home  != null) outcomes.home  = Number(odds.home);
    if (odds.draw  != null) outcomes.draw  = Number(odds.draw);
    if (odds.away  != null) outcomes.away  = Number(odds.away);
    if (odds.over  != null) outcomes.over  = Number(odds.over);
    if (odds.under != null) outcomes.under = Number(odds.under);
  }
  return outcomes;
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

  // Intentamos los dos paths más probables
  let raw = await sgoFetch('/events/?sport=soccer&leagueId=FIFA-WORLD-CUP');
  if (!raw || (Array.isArray(raw) && raw.length === 0)) {
    raw = await sgoFetch('/events/?sport=soccer&league=FIFA+World+Cup');
  }

  if (!raw || (Array.isArray(raw) && raw.length === 0)) {
    return new Response(
      JSON.stringify({ ok: false, reason: 'no-data', events: [], timestamp: now.toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=3600' } }
    );
  }

  const updatedAt = now.toISOString();
  const events = (Array.isArray(raw) ? raw : []).map((ev) => {
    const homeTeam = ev.home ?? ev.homeTeam ?? ev.teams?.home ?? {};
    const awayTeam = ev.away ?? ev.awayTeam ?? ev.teams?.away ?? {};

    // Mercados del evento
    const rawMarkets = ev.markets ?? ev.odds ?? [];
    const markets = [];

    for (const mkt of (Array.isArray(rawMarkets) ? rawMarkets : Object.entries(rawMarkets).map(([k,v]) => ({ key: k, ...v })))) {
      const marketKey = normalizeMarketKey(mkt.key ?? mkt.market ?? mkt.type ?? '');
      const outcomes  = extractOutcomes(mkt);
      if (Object.keys(outcomes).length === 0) continue;

      markets.push({
        key:       marketKey,
        bookmaker: ev.bookmaker ?? mkt.bookmaker ?? 'sgo',
        source:    'sgo',
        outcomes,
        updatedAt,
      });
    }

    return {
      id:      String(ev.id ?? ev.eventId ?? ev.event_id ?? ''),
      kickoff: ev.commence_time ?? ev.date ?? ev.start ?? null,
      home:    { name: homeTeam.name ?? homeTeam.team ?? String(homeTeam) },
      away:    { name: awayTeam.name ?? awayTeam.team ?? String(awayTeam) },
      markets,
    };
  });

  return new Response(
    JSON.stringify({ ok: true, events, timestamp: updatedAt }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=10800, stale-while-revalidate=1800' } }
  );
}
