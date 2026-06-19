/**
 * api/matches.js  —  Vercel Edge Function
 * ─────────────────────────────────────────────────────────────────
 * Proxy server-side hacia la API pública de ESPN para datos del
 * Mundial FIFA 2026 en tiempo real (sin clave de API).
 *
 * Ventajas de hacerlo server-side:
 *  - Sin problemas de CORS (el servidor llama a ESPN, no el browser).
 *  - La clave no se expone (aunque ESPN es pública).
 *  - Cache de 60s en el Edge para amortiguar el tráfico.
 */
export const config = { runtime: 'edge' };

const ESPN_ENDPOINTS = [
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.worldcup/scoreboard',
  'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard',
];

const HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124',
};

export default async function handler() {
  let events = [];
  let source = 'unavailable';

  for (const url of ESPN_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const tId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(url, { headers: HEADERS, signal: controller.signal });
      clearTimeout(tId);

      if (!res.ok) continue;

      const data = await res.json();
      // ESPN envuelve los eventos en distintas estructuras según el endpoint.
      const raw =
        data?.events ??
        data?.sports?.[0]?.leagues?.[0]?.events ??
        [];

      if (raw.length > 0) {
        events = raw;
        source = 'espn';
        break;
      }
    } catch {
      continue;
    }
  }

  return new Response(
    JSON.stringify({ events, source, timestamp: new Date().toISOString() }),
    {
      headers: {
        'Content-Type': 'application/json',
        // 60s de cache; si el edge lo tiene guardado sirve inmediato al usuario.
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=30',
      },
    }
  );
}
