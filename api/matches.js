/**
 * api/matches.js  —  Vercel Edge Function
 * ─────────────────────────────────────────────────────────────────
 * Proxy server-side hacia la API pública de ESPN.
 * Consulta HOY + próximos 13 días en paralelo para mostrar
 * partidos próximos del Mundial 2026 (fase de grupos + eliminatorias).
 */
export const config = { runtime: 'edge' };

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.worldcup/scoreboard';
const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124',
};

async function fetchDay(dateStr) {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${BASE}?dates=${dateStr}`, { headers: HEADERS, signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) return [];
    const data = await res.json();
    return data?.events ?? data?.sports?.[0]?.leagues?.[0]?.events ?? [];
  } catch {
    return [];
  }
}

export default async function handler() {
  const now = new Date();

  // Ventana: ayer + hoy + próximos 13 días = 15 días totales
  // Cubre toda la fase de grupos y el inicio de eliminatorias.
  const dates = Array.from({ length: 15 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + i - 1); // -1 = ayer
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  });

  // Fetch en paralelo de todos los días
  const results = await Promise.all(dates.map(fetchDay));

  // Deduplicar por event ID, ordenar cronológicamente
  const seen = new Set();
  const events = results
    .flat()
    .filter((ev) => {
      if (!ev?.id || seen.has(ev.id)) return false;
      seen.add(ev.id);
      return true;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const source = events.length > 0 ? 'espn' : 'unavailable';

  return new Response(
    JSON.stringify({ events, source, timestamp: now.toISOString() }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
      },
    }
  );
}
