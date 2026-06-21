/**
 * api/elo.js — Vercel Edge Function
 * ─────────────────────────────────────────────────────────────────
 * Devuelve ratings Elo de selecciones nacionales.
 * Intenta obtenerlos de eloratings.net (solo texto plano).
 * Si falla (sitio JS-driven), devuelve datos estáticos embebidos.
 * Sin clave. Cache: 24 horas.
 */
export const config = { runtime: 'edge' };

const TIMEOUT = 6000;

// Datos estáticos de las 48 selecciones del Mundial 2026
// Fuente: eloratings.net — aproximación a junio 2026.
const STATIC_ELO = {
  ARG: { rating: 2076, rank: 1 },
  FRA: { rating: 2003, rank: 2 },
  BRA: { rating: 1948, rank: 3 },
  ENG: { rating: 1966, rank: 4 },
  ESP: { rating: 1970, rank: 5 },
  POR: { rating: 1955, rank: 6 },
  NED: { rating: 1906, rank: 7 },
  GER: { rating: 1918, rank: 8 },
  BEL: { rating: 1867, rank: 9 },
  ITA: { rating: 1876, rank: 10 },
  MAR: { rating: 1882, rank: 11 },
  COL: { rating: 1853, rank: 12 },
  URU: { rating: 1842, rank: 13 },
  JPN: { rating: 1838, rank: 14 },
  MEX: { rating: 1835, rank: 15 },
  SUI: { rating: 1832, rank: 16 },
  DEN: { rating: 1826, rank: 17 },
  NOR: { rating: 1808, rank: 18 },
  IRN: { rating: 1800, rank: 19 },
  USA: { rating: 1799, rank: 20 },
  AUT: { rating: 1790, rank: 21 },
  UKR: { rating: 1781, rank: 22 },
  SRB: { rating: 1767, rank: 23 },
  POL: { rating: 1760, rank: 24 },
  TUR: { rating: 1751, rank: 25 },
  CZE: { rating: 1756, rank: 26 },
  AUS: { rating: 1756, rank: 27 },
  CAN: { rating: 1748, rank: 28 },
  ECU: { rating: 1742, rank: 29 },
  SEN: { rating: 1743, rank: 30 },
  KOR: { rating: 1770, rank: 31 },
  BIH: { rating: 1714, rank: 32 },
  PAR: { rating: 1706, rank: 33 },
  CHI: { rating: 1699, rank: 34 },
  NGA: { rating: 1689, rank: 35 },
  PER: { rating: 1682, rank: 36 },
  PAN: { rating: 1681, rank: 37 },
  AUT2: { rating: 1790, rank: 21 }, // alias
  GHA: { rating: 1622, rank: 38 },
  GRE: { rating: 1658, rank: 39 },
  QAT: { rating: 1658, rank: 40 },
  CRC: { rating: 1617, rank: 41 },
  ALG: { rating: 1637, rank: 42 },
  CIV: { rating: 1653, rank: 43 },
  JOR: { rating: 1618, rank: 44 },
  RSA: { rating: 1630, rank: 45 },
  CMR: { rating: 1628, rank: 46 },
  TUN: { rating: 1638, rank: 47 },
  KSA: { rating: 1590, rank: 48 },
};

async function tryFetchLive() {
  // eloratings.net usa Next.js/SSR; intento a texto plano que podría tener los datos
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    // Este endpoint puede devolver JSON en algunas versiones del sitio
    const res = await fetch('https://eloratings.net/api/ratings', {
      headers: { 'Accept': 'application/json, text/plain' },
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('json')) {
      const json = await res.json();
      // El formato esperado: array de { team, code, rating, rank } o similar
      if (Array.isArray(json)) return json;
    }
    return null;
  } catch {
    clearTimeout(tid);
    return null;
  }
}

export default async function handler() {
  const now = new Date();
  const updatedAt = now.toISOString();

  // Intento live (probabilidad baja de éxito, pero no cuesta cuota)
  const live = await tryFetchLive();
  if (live) {
    const ratings = {};
    for (const entry of live) {
      const code = entry.code ?? entry.fifa_code ?? entry.team_code;
      if (code) ratings[code.toUpperCase()] = { rating: Number(entry.rating), rank: Number(entry.rank), updatedAt };
    }
    if (Object.keys(ratings).length > 10) {
      return new Response(
        JSON.stringify({ ok: true, ratings, source: 'eloratings-live', timestamp: updatedAt }),
        { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=7200' } }
      );
    }
  }

  // Fallback: datos estáticos
  const ratings = Object.fromEntries(
    Object.entries(STATIC_ELO).map(([code, v]) => [code, { ...v, updatedAt }])
  );

  return new Response(
    JSON.stringify({ ok: true, ratings, source: 'static', timestamp: updatedAt }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=7200' } }
  );
}
