# AGENTS.md — Mapa de rutas, adaptadores y flujo de datos

## Rutas de la API (`/api/*`)

### `GET /api/matches`

**Archivo**: `api/matches.js`  
**Runtime**: Vercel Edge Function (`export const config = { runtime: 'edge' }`)  
**Cache**: `public, max-age=60, stale-while-revalidate=30`

#### Qué hace
Proxy server-side hacia la ESPN scoreboard API pública. Consulta en paralelo ayer + hoy + 13 días futuros (15 fechas) para devolver todos los eventos disponibles. ESPN solo retorna eventos del día actual (y a veces el día anterior). Las fechas futuras devuelven 400 silenciosamente.

#### Request
```
GET /api/matches
```
Sin parámetros. No requiere autenticación.

#### Response
```json
{
  "events": [ /* array de EventoESPN raw */ ],
  "source": "espn" | "unavailable",
  "timestamp": "2026-06-20T04:16:35.467Z"
}
```
`events` es el array raw de ESPN sin normalizar. La normalización ocurre en el cliente (`normalizeESPNEvent`).

#### ESPN upstream
```
https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.worldcup/scoreboard?dates=YYYYMMDD
```
- Solo retorna datos del día actual (a veces también ayer).
- Fechas futuras → HTTP 400 → `fetchDay()` devuelve `[]`.
- Timeout por fecha: 6 segundos (AbortController).

---

## Adaptadores de `sportsApiService.js`

### Proveedor activo
Controlado por la variable de entorno `VITE_DATA_PROVIDER` (default: `'espn'`).

### `fetchFromESPN()` → Match[]
1. Llama a `GET /api/matches` (el Edge Function anterior).
2. Extrae `events` del JSON.
3. Mapea cada evento con `normalizeESPNEvent()`.
4. Si `events` está vacío → lanza error → `getLiveMatches` cae al fallback demo.

### `normalizeESPNEvent(ev)` → Match | null
Pipeline de normalización ESPN → Match:
1. Extrae `comp = ev.competitions[0]`
2. Encuentra competidores home/away por `homeAway` field
3. Determina `status`:
   - `STATUS_IN_PROGRESS` o `statusId === '2'` → `'live'`
   - `STATUS_FINAL / STATUS_FULL_TIME / STATUS_FINAL_AET / STATUS_FINAL_PEN` o `statusId === '28'` → `'finished'`
   - Fallback de fecha: `ev.date < now - 2h` → `'finished'`
   - Resto → `'upcoming'`
4. Llama `resolveTeam()` para cada equipo
5. Llama `extractGroupFromESPN()` para determinar el grupo
6. Llama `buildOdds()` para construir cuotas del modelo
7. Retorna objeto Match normalizado con `dataSource: 'espn'`

### `extractGroupFromESPN(ev, comp)` → string | null
Busca la letra del grupo (A–L) en este orden de prioridad:
1. `comp.notes[].headline` / `.text`
2. `ev.name`, `ev.shortName`, `ev.league.name`, `ev.season.description`
Regex: `/Group\s+([A-L])/i`

### `resolveTeam(apiName)` → TeamObject
1. Busca `apiName` en `ESPN_NAME_MAP` (inglés → español)
2. Busca en `allTeams` (flat de `worldcup.groups`) por nombre exacto normalizado
3. Fallback: objeto genérico con `flag: '⚽'`, `rank: 50`, `code: apiName.slice(0,3).toUpperCase()`

### `buildOdds(home, away)` → OddsObject
Estima cuotas decimales a partir de ranking FIFA + sigmoid logístico:
- `diff = ratingHome - ratingAway` (basado en log10 del ranking)
- `pHome = sigmoid(3.2 * diff)`
- `pDraw = clamp(0.30 * (1 - |diff|), 0.16, 0.34)`
- Aplica margen de casa 6% (`margin = 1.06`)
- Retorna `{ home, draw, away, source: 'model' }`

### `getStaticSchedule()` → Match[]
Lee `worldcup.schedule` del JSON y convierte cada fixture en un Match con `status: 'upcoming'` y `dataSource: 'schedule'`. Permite mostrar partidos futuros que ESPN no devuelve.

### `pairKey(codeA, codeB)` → string
Clave de deduplicación: `[codeA, codeB].sort().join('-')` — independiente del orden home/away.

### `fetchFromOddsApi()` / `fetchFromApiFootball()` → Match[]
Implementados pero **sin uso activo** (requieren API keys no configuradas):
- The Odds API: `VITE_ODDS_API_KEY` → `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/`
- API-Football v3: `VITE_API_FOOTBALL_KEY` → `https://v3.football.api-sports.io/fixtures`

### `generateMockMatches()` → Match[]
Genera partidos simulados rotando status cada minuto (determinista por timestamp). Usado como fallback cuando el proveedor activo falla.

---

## Flujo de datos: Dashboard → service → adviceEngine

```
Dashboard.jsx
│
├── useEffect(refresh)                     // carga inicial
│
└── refresh() → getLiveMatches()
      │
      ├── fetchFromESPN()
      │     └── GET /api/matches  [Edge Function]
      │           └── ESPN scoreboard API (15 fechas en paralelo)
      │
      ├── normalizeESPNEvent() × N         // raw ESPN → Match normalizado
      │
      ├── getStaticSchedule()              // worldcup2026.json schedule → Match[]
      │
      ├── deduplicar por pairKey()         // static fixture no cubierto por ESPN
      │
      └── sort: live → upcoming → finished (cronológico dentro de cada estado)
            │
            └── setMatches(data)
                  │
                  ├── counts (live / upcoming / total)
                  │
                  ├── scheduleAutoRefresh(hasLive)
                  │     ├── 45s si hay partidos EN VIVO
                  │     └── 90s sin partidos activos
                  │
                  └── filtered (statusFilter + groupFilter en memoria)
                        │
                        └── MatchCard × N
                              │
                              └── analyzeMatch(match)  [adviceEngine.js]
                                    ├── modelProbabilities(odds, home, away)
                                    │     ├── impliedProbabilities(odds)
                                    │     └── teamRating(team) × 2
                                    ├── recommendedStake(pick.prob, pick.odds)  // ¼ Kelly
                                    ├── riskLevel(probs, {home, away, volatility})
                                    └── keyStat(home, away, probs)
```

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `VITE_DATA_PROVIDER` | `'espn'` | Proveedor activo: `espn` / `odds-api` / `api-football` / `mock` |
| `VITE_ODDS_API_KEY` | — | API key de The Odds API (no configurada) |
| `VITE_API_FOOTBALL_KEY` | — | API key de API-Football (no configurada) |

Ver `.env.example` para la plantilla.
