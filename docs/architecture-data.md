# Arquitectura de la capa de fusión de datos

> **Estado:** PROPUESTA / contrato de diseño. No implementado todavía.
> **Fecha:** 2026-06-20
> **Alcance:** define el contrato entre las 7 fuentes gratuitas y la UI. La
> implementación (adaptadores, Edge Functions, store de cache) es posterior.

---

## 1. Objetivo y principios

Unificar 7 fuentes heterogéneas detrás de **un solo endpoint de lectura**
(`GET /api/matches`) que devuelve `Match[]` normalizado, sin exponer ninguna
clave al cliente y **sin que el tráfico de usuarios consuma cuota** de las APIs
limitadas.

Principios rectores:

1. **Separación lectura/escritura (CQRS ligero).**
   - *Read path*: usuario → `/api/matches` → lee **solo del cache** (KV + edge cache). Nunca toca una API con clave en caliente.
   - *Write path*: Vercel Cron → `/api/cron/*` → consulta los upstreams respetando cuotas → escribe snapshots normalizados en el store. Desacopla el consumo de cuota del tráfico real.
2. **Claves siempre server-side.** Variables sin prefijo `VITE_` → nunca entran al bundle. Solo las leen las Edge Functions.
3. **Una Edge Function por fuente** + un agregador. Cada adaptador normaliza al esquema unificado; el agregador fusiona.
4. **Degradación elegante.** Si una capa falla, las demás siguen. Las cuotas del modelo (`buildOdds`) son el último fallback de odds.
5. **Identidad canónica.** Todo equipo se resuelve a un **código FIFA de 3 letras** vía crosswalk; toda fixture a un **id canónico**. Sin esto la fusión produce duplicados.

---

## 2. Fuentes (resumen)

| # | Fuente | Clave | Cuota | Qué aporta (autoridad) |
|---|--------|:-----:|-------|------------------------|
| 1 | **ESPN** scoreboard | No | Generosa | Estado en vivo, minuto, marcador (solo día actual), grupo |
| 2 | **rezarahiminia/worldcup2026** (raw GitHub JSON) | No | Estático | Calendario completo (104), equipos, grupos, tablas, estadios |
| 3 | **BALLDONTLIE** FIFA WC | Sí | Free 5 req/min | Datos de partido + odds |
| 4 | **API-Football** v3 | Sí | 100/día | Fixtures, stats, standings, forma, odds |
| 5 | **SportsGameOdds** (SGO) | Sí | Media (verificar) | Odds WC multi-casa, multi-mercado |
| 6 | **OddsPapi** | Sí | **250/mes** (la más limitada) | Odds, 350+ casas |
| 7 | **eloratings.net** | No | Estático | Rating Elo + ranking mundial de selecciones |

> **A verificar en implementación** (no bloquea el diseño): endpoint exacto y forma de odds de BALLDONTLIE-WC; esquema de mercados de SGO y OddsPapi; método de fetch programático de eloratings.net (sitio JS-driven, posible mirror/dataset); rutas raw exactas de rezarahiminia.

---

## 3. (a) Esquema `Match` unificado extendido

Definición en pseudo-TypeScript (el proyecto es JS; esto es el contrato).

```ts
type Stage = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'third' | 'final';
type Status = 'scheduled' | 'live' | 'finished' | 'postponed';

interface Match {
  id: string;                       // id canónico (ver §4)
  sourceIds: Record<string, string>;// provenance: id original por fuente
  stage: Stage;
  group: string | null;             // 'A'..'L' | null (eliminatorias)
  matchday: number | null;          // 1..3 en fase de grupos
  status: Status;
  minute: number | null;            // si status === 'live'
  kickoff: string;                  // ISO 8601 UTC
  venue: Venue | null;
  home: TeamRef;
  away: TeamRef;
  score: Score;
  markets: Market[];                // odds por mercado y por casa (ver abajo)
  consensus: Record<string, ConsensusOdds>; // derivado: clave = market.key
  meta: MatchMeta;
}

interface TeamRef {
  code: string;                     // FIFA 3 letras (canónico) — clave de fusión
  name: string;                     // español
  flag: string;                     // emoji o URL
  group: string | null;
  fifaRank: number | null;          // API-Football / ESPN
  elo: { rating: number; rank: number; updatedAt: string } | null; // eloratings
  form: string | null;              // 'WWDLW' (últimos 5)
  formDetail: FormMatch[] | null;   // detalle por partido
  stats: TeamStats | null;          // avgGF, avgGA, cleanSheets, played
  score: number | null;             // marcador en ESTE partido (null si scheduled)
}

interface Market {
  key: string;                      // normalizado: '1x2' | 'dc' | 'btts' | 'ou@2.5' | 'ah@-0.5' | 'dnb'
  type: 'match_winner' | 'double_chance' | 'both_teams_score'
      | 'totals' | 'asian_handicap' | 'draw_no_bet';
  line: number | null;              // para totals / handicap
  books: BookOdds[];                // una entrada por casa
}

interface BookOdds {
  bookmaker: string;                // 'bet365' | 'pinnacle' | 'model' | ...
  source: string;                   // 'oddspapi' | 'sgo' | 'balldontlie' | 'apifootball' | 'model'
  outcomes: Record<string, number>; // 1x2: {home,draw,away} · ou: {over,under} · btts: {yes,no}
  updatedAt: string;
}

interface ConsensusOdds {           // resumen del mercado a través de todas las casas
  outcomes: Record<string, { best: number; bestBook: string; avg: number; implied: number }>;
  bookCount: number;
  overround: number;                // vig de la línea media (1.06 = 6%)
}

interface Score { home: number | null; away: number | null; aggregate?: string; penalties?: string; }
interface Venue { id: string | null; name: string; city: string; country: string; }
interface FormMatch { date: string; opponent: string; result: 'W'|'D'|'L'; score: string; }
interface TeamStats { avgGF: number; avgGA: number; cleanSheets: number; played: number; }
interface MatchMeta {
  lastUpdated: string;              // ISO del snapshot agregado
  dataSources: string[];            // fuentes que contribuyeron a este Match
  freshness: Record<string, string>;// capa → ISO de su último refresh (schedule, live, odds, elo)
  oddsAreModel: boolean;            // true si markets solo tiene la casa 'model'
}
```

Cumple lo pedido: `markets[]` = **odds por casa (`BookOdds`) agrupadas por mercado (`Market`)**; `TeamRef.elo` = **ratings Elo**; `TeamRef.form` + `formDetail` = **forma reciente**.

> **Compatibilidad:** el `adviceEngine.js` actual consume `odds.{home,draw,away}`. Se añade un selector `pickPrimaryOdds(match)` que extrae el 1x2 de `consensus['1x2']` (best o avg) → objeto `{home,draw,away,source}` legacy. Así el motor no se reescribe en esta fase.

---

## 4. Identidad canónica y crosswalk de equipos

La fusión depende de resolver el **mismo equipo** y el **mismo partido** entre fuentes que usan nombres/ids distintos ("Czechia" vs "Rep. Checa" vs id numérico).

- **Crosswalk de equipos** `data/team-crosswalk.json`: mapea, por fuente, identificadores/nombres → **código FIFA canónico**. Reemplaza y amplía el actual `ESPN_NAME_MAP`.
  ```json
  { "CZE": { "fifa": "CZE", "es": "República Checa", "flag": "🇨🇿",
             "espn": ["Czechia","Czech Republic"], "apifootball": [25],
             "rezar": ["cze"], "elo": ["Czechia"] } }
  ```
- **Id canónico de fixture:** preferir el id de rezarahiminia (calendario maestro de 104). Para cruzar con otras fuentes usar clave sintética determinista:
  `key = `${stage}:${matchday ?? 0}:${[codeA,codeB].sort().join('-')}``.
- **resolveTeam(source, raw)** → `TeamRef` base; **resolveFixture(source, raw)** → id canónico. Si un equipo no está en el crosswalk: fallback genérico (`flag '⚽'`, `rank null`) **y se loguea** para añadirlo (deuda explícita, ver STATUS.md).

---

## 5. (b) Mapeo campo → fuente (prioridad y fallback)

Orden = se usa el primero disponible; si es `null/stale`, cae al siguiente.

### Capa ESTRUCTURA (calendario, identidad, sede)
| Campo | Prioridad → fallback |
|-------|----------------------|
| Lista de fixtures, `stage`, `matchday`, `kickoff` | **rezarahiminia** → ESPN → API-Football |
| `venue` | rezarahiminia → API-Football |
| `home/away.code`, `name`, `flag`, `group` | **crosswalk** (canónico) → rezarahiminia → local JSON |

### Capa ESTADO EN VIVO (lo que cambia minuto a minuto)
| Campo | Prioridad → fallback |
|-------|----------------------|
| `status`, `minute`, `score` (partido de hoy) | **ESPN** (gratis, tiempo real) → API-Football (cron) |
| `score` de partidos ya jugados | ESPN (mismo día) → rezarahiminia (consolidado) |

### Capa RATINGS Y FORMA
| Campo | Prioridad → fallback |
|-------|----------------------|
| `fifaRank` | API-Football → ESPN |
| `elo` | **eloratings.net** (único proveedor) |
| `form`, `formDetail` | API-Football (stats) → ESPN → derivado de fixtures finished (rezarahiminia) |
| `stats` (avgGF/GA, cleanSheets) | API-Football → derivado de rezarahiminia |

### Capa ODDS (mercados y casas) — se **fusionan**, no se eligen
| Aspecto | Estrategia |
|---------|-----------|
| Poblar `markets[]` | **Unión** de OddsPapi + SGO + BALLDONTLIE + API-Football. Cada `BookOdds` etiqueta su `source`. Dedup por `(bookmaker, market.key)` priorizando la fuente con timestamp más fresco. |
| `consensus[market]` | Derivado: `best` = mejor cuota entre casas; `avg` = media; `implied` = prob. desvigada; `overround` de la media. |
| Fixture sin odds reales | Sintetizar **1x2** con `buildOdds(home,away)` → `BookOdds{ bookmaker:'model', source:'model' }`; `meta.oddsAreModel = true`. |
| Amplitud por casa | OddsPapi aporta amplitud de casas (350+); SGO aporta amplitud de mercados; se complementan. |

**Regla de oro de odds:** el *read path* nunca llama a estas APIs. `markets[]` se rellena desde el snapshot que dejó el cron (§6–7).

---

## 6. Algoritmo de fusión (agregador `/api/matches`)

```
1. base      ← KV:snapshot:schedule        (rezarahiminia, 104 fixtures canónicas)
2. live      ← /api/espn (cache 30s)        → overlay status/minute/score por id canónico
3. ratings   ← KV:snapshot:elo + KV:snapshot:apifootball-meta
                                             → adjunta elo/fifaRank/form/stats a TeamRef
4. odds      ← KV:snapshot:odds             → markets[] por fixture; calcula consensus[]
5. fallback  ← si markets vacío: buildOdds() → BookOdds 'model'
6. freshness ← rellena meta.freshness por capa; ordena live→scheduled→finished
7. return Match[]                            (Cache-Control: s-maxage=30, SWR=30)
```

Todo lo de KV lo escribieron los crons; el único fetch en caliente es ESPN (gratis).

---

## 7. (c) Estrategia de cache por fuente (respetando cuotas)

Store: **Vercel KV** (o Upstash Redis) para snapshots normalizados y para el **contador de presupuesto** de las APIs limitadas (las Edge Functions son stateless → el guard necesita store externo).

| Fuente | Mecanismo | TTL / frecuencia | Guard de cuota |
|--------|-----------|------------------|----------------|
| **OddsPapi** (250/mes) | **Solo vía Cron** → KV | Cron 2×/día (~60/mes, deja margen). Batch (todos los WC en 1 llamada si soporta) | Contador mensual en KV con **tope duro = 8/día**; si se alcanza, no llama |
| **SGO** | Cron → KV | Cron cada 3–6 h | Contador diario defensivo |
| **API-Football** (100/día) | Cron → KV | Cron 3–4×/día para stats/standings/odds. **No** para live (lo cubre ESPN gratis) | Contador diario, tope 80/día |
| **BALLDONTLIE** (5/min) | Cron → KV | Cron cada 1–2 h | Throttle 1 req/12s |
| **ESPN** | On-demand en read path | `s-maxage=30, SWR=30` (vivo) | — (sin clave) |
| **rezarahiminia** | Cron → KV (+ snapshot en build) | Cron cada 6–24 h | — (estático) |
| **eloratings.net** | Cron → KV | Cron 1×/día (cambia solo tras ventanas FIFA) | — (estático) |

Patrón de capa: `s-maxage` (edge CDN) corto en `/api/matches`; los datos pesados/limitados viven en KV con TTL largo, refrescados por cron. **El usuario nunca gatilla una llamada con clave.**

Presupuesto OddsPapi (crítico): 250/mes ÷ 30 ≈ 8/día. Diseño objetivo: **2 refrescos/día batch ≈ 60/mes**, dejando ~190 de colchón para reintentos y días de alta actividad.

---

## 8. (d) Edge Functions `/api/*`

Todas `export const config = { runtime: 'edge' }`. Una por fuente (adaptador) + agregador + crons.

### Lectura (las consume el cliente o el agregador)
| Ruta | Fuente | Clave (env server-side) | Cache |
|------|--------|-------------------------|-------|
| `GET /api/matches` | **Agregador** (fusiona KV + ESPN) | — | `s-maxage=30, SWR=30` |
| `GET /api/espn` | ESPN | — | `s-maxage=30, SWR=30` |

### Adaptadores por fuente (los invoca el cron; cacheables)
| Ruta | Fuente | Clave (env) |
|------|--------|-------------|
| `GET /api/schedule` | rezarahiminia raw JSON | — |
| `GET /api/elo` | eloratings.net | — |
| `GET /api/apifootball` | API-Football | `API_FOOTBALL_KEY` |
| `GET /api/balldontlie` | BALLDONTLIE | `BALLDONTLIE_API_KEY` |
| `GET /api/sgo` | SportsGameOdds | `SPORTSGAMEODDS_API_KEY` |
| `GET /api/oddspapi` | OddsPapi | `ODDSPAPI_API_KEY` |

### Cron (write path → escribe snapshots en KV)
| Ruta (Vercel Cron) | Hace | Frecuencia objetivo |
|--------------------|------|---------------------|
| `/api/cron/refresh-schedule` | rezarahiminia → `KV:snapshot:schedule` | cada 6–24 h |
| `/api/cron/refresh-elo` | eloratings → `KV:snapshot:elo` | 1×/día |
| `/api/cron/refresh-meta` | API-Football stats/standings → `KV:snapshot:apifootball-meta` | 3–4×/día |
| `/api/cron/refresh-odds` | OddsPapi + SGO + BALLDONTLIE → `KV:snapshot:odds` (con guards de presupuesto) | OddsPapi 2×/día; SGO/BDL más seguido |

Crons declarados en `vercel.json → crons[]`. Protegidos con `CRON_SECRET` (header) para que no los disparen terceros.

---

## 9. Variables de entorno

| Variable | Lado | Uso |
|----------|------|-----|
| `API_FOOTBALL_KEY` | server | `/api/apifootball`, cron |
| `BALLDONTLIE_API_KEY` | server | `/api/balldontlie`, cron |
| `SPORTSGAMEODDS_API_KEY` | server | `/api/sgo`, cron |
| `ODDSPAPI_API_KEY` | server | `/api/oddspapi`, cron |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | server | Vercel KV / Upstash |
| `CRON_SECRET` | server | Autenticar invocaciones de cron |
| `VITE_DATA_PROVIDER` | cliente | Compat: forzar `mock` en dev sin backend |

> Migración: las claves dejan de usar prefijo `VITE_` (hoy `VITE_ODDS_API_KEY`, `VITE_API_FOOTBALL_KEY`) → renombradas a server-side. El cliente solo habla con `/api/*`.

---

## 10. Manejo de errores y degradación

- Cada adaptador: timeout (AbortController ~6 s), `try/catch` → devuelve vacío en vez de propagar.
- Agregador: si una capa KV falta, omite esa capa y marca `meta.freshness[capa] = 'stale'`.
- Sin ninguna odds real → `oddsAreModel = true` (la UI ya distingue "Cuotas estimadas (modelo)").
- Guard de presupuesto agotado → el cron hace *no-op* y conserva el último snapshot (la UI muestra odds del último refresh con `freshness.odds` envejecido).

---

## 11. Plan de implementación por fases (post-aprobación)

1. **Cimientos:** `team-crosswalk.json` + `resolveTeam/resolveFixture`; provisionar Vercel KV; mover claves a env server-side.
2. **Estructura:** `/api/schedule` + cron → migrar de `worldcup2026.json` a rezarahiminia (104 partidos reales). Reescribir `getLiveMatches` para leer del agregador.
3. **Agregador + ESPN overlay:** `/api/matches` fusiona schedule(KV) + ESPN(vivo); refactor del esquema `Match` extendido + `pickPrimaryOdds` para compat con `adviceEngine`.
4. **Ratings:** `/api/elo` + `/api/apifootball` + crons → poblar `elo/fifaRank/form/stats`.
5. **Odds reales:** `/api/oddspapi` + `/api/sgo` + `/api/balldontlie` + `refresh-odds` con guards → `markets[]` + `consensus[]`. UI: comparador de casas por mercado.
6. **Robustez:** ErrorBoundary, panel de `freshness`, tests del fusionador y de los guards de cuota.

---

## 12. Riesgos y cuestiones abiertas

- **Verificación de APIs:** forma real de odds de BALLDONTLIE-WC, SGO y OddsPapi; fetch programático de eloratings.net; rutas raw de rezarahiminia. Cada adaptador valida su contrato en su fase.
- **Vercel KV:** requiere plan con KV/Upstash habilitado. Sin KV, alternativa: snapshots en edge cache con `s-maxage` largo, pero se pierde el contador de presupuesto fiable → riesgo de exceder OddsPapi. **KV recomendado.**
- **Coincidencia de fixtures:** nombres de equipos inconsistentes son la principal fuente de bugs de fusión; el crosswalk debe mantenerse al día (deuda explícita).
- **Cron en Vercel Hobby:** límite de frecuencia de crons en el plan gratuito (verificar mínimos). Si insuficiente, consolidar en menos crons multipropósito.
