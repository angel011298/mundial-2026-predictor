# CLAUDE.md — Mundial 2026 Predictor

## Stack y versiones

| Tecnología | Versión | Rol |
|---|---|---|
| React | 18.3.1 | UI |
| Vite | 5.3.1 | Bundler / dev server |
| Tailwind CSS | 3.4.4 | Estilos |
| Lucide React | 0.395.0 | Iconos |
| PostCSS + Autoprefixer | 8.x / 10.x | Pipeline CSS |
| Vercel Edge Runtime | — | API proxy (`/api/matches`) |

Node target: ES2020. Sin TypeScript, sin tests, sin state manager externo.

## Scripts

```bash
npm run dev      # Dev server en http://localhost:5173 (expuesto en LAN para móvil)
npm run build    # Build de producción → dist/
npm run preview  # Preview del build local en :4173
npm run lint     # ESLint máx. 0 warnings (no bloquea el build)
```

El deploy a Vercel es automático con cada `git push origin master`.

## Esquema Match (objeto normalizado)

Todos los proveedores y el calendario estático devuelven este esquema:

```js
{
  id:         string,           // ESPN event ID o "sc-a-r2-1" (estático) o "mock-N"
  group:      string,           // Letra "A"–"L", "—" si desconocido
  status:     'live' | 'upcoming' | 'finished',
  minute:     number | null,    // Minuto actual si status === 'live'
  kickoff:    string,           // ISO 8601 UTC, ej. "2026-06-24T23:00:00Z"
  home: {
    name:        string,        // Nombre en español, ej. "México"
    code:        string,        // 3 letras, ej. "MEX"
    flag:        string,        // Emoji de bandera
    rank:        number,        // Ranking FIFA
    form:        string,        // "WWDLW" (últimos 5 partidos)
    avgGF:       number,        // Goles a favor por partido
    avgGA:       number,        // Goles en contra por partido
    cleanSheets: number,        // Porterías a cero en últimos 5
    group:       string,        // Grupo del equipo en el JSON local
    score:       number | null, // null si upcoming
  },
  away: { /* mismo esquema que home */ },
  odds: {
    home:   number,             // Cuota decimal local
    draw:   number,             // Cuota decimal empate
    away:   number,             // Cuota decimal visitante
    source: 'model' | 'market', // "model" = calculada, "market" = bookmaker
  },
  volatility:  number,         // 0..1 (cambio relativo de cuota; siempre 0 por ahora)
  dataSource:  'espn' | 'schedule' | 'odds-api' | 'api-football' | 'demo',
}
```

## Tema Tailwind / Convenciones de estilo

### Paleta base
- **Fondo**: `bg-zinc-950` (#09090b) — toda la app
- **Tarjetas**: `bg-zinc-900/60` con `border-zinc-800/80` y `backdrop-blur-sm`
- **Texto principal**: `text-zinc-50` / `text-zinc-100`
- **Texto secundario**: `text-zinc-400` / `text-zinc-500`
- **Texto muted**: `text-zinc-600`

### Acentos de marca (en `tailwind.config.js`)
| Token | Hex | Uso |
|---|---|---|
| `brand-emerald` | #10b981 | Acción principal, picks ganadores, éxito |
| `brand-emerald-soft` | #34d399 | Hover, texto sobre fondo oscuro |
| `brand-violet` | #8b5cf6 | Datos / IA, filtros de grupo |
| `brand-violet-soft` | #a78bfa | Texto IA sobre fondo oscuro |

### Tono semántico (centralizado en `src/utils/format.js → toneClasses`)
```js
emerald → bg-emerald-500/15 text-emerald-300 border-emerald-500/30  // Bajo riesgo / buena cuota
violet  → bg-violet-500/15  text-violet-300  border-violet-500/30   // Moderado / IA
amber   → bg-amber-500/15   text-amber-300   border-amber-500/30    // Medio riesgo / agresivo
rose    → bg-rose-500/15    text-rose-300    border-rose-500/30      // Alto riesgo / EN VIVO
muted   → bg-zinc-700/30    text-zinc-400    border-zinc-600/40      // Sin valor
```

### Clases utilitarias globales (`src/index.css`)
- `.card` — `rounded-2xl border border-zinc-800/80 bg-zinc-900/60 backdrop-blur-sm`
- `.chip` — `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold`

### Sombras personalizadas
- `shadow-glow` — resplandor esmeralda sutil (tarjetas activas)
- `shadow-glow-violet` — resplandor violeta (elementos IA)

### Animaciones
- `animate-pulse-ring` — anillo verde en el botón de refresh
- `animate-fade-up` — entrada de tarjetas / elementos expandibles
- `animate-bar-grow` — crecimiento de la barra de probabilidades

### Layout
- Siempre `max-w-md mx-auto px-4` — columna centrada mobile-first
- Header `sticky top-0 z-20` con `backdrop-blur-lg`
- `pb-28` en `<main>` para dejar espacio al safe area inferior en iOS

## Componentes

| Archivo | Responsabilidad |
|---|---|
| `App.jsx` | Raíz: monta Dashboard + footer de aviso responsable |
| `Dashboard.jsx` | Orquestador: fetch, auto-refresh, filtros, contadores, lista de MatchCards |
| `Header.jsx` | Cabecera sticky con logo del torneo y RefreshButton |
| `RefreshButton.jsx` | Botón de sync + proveedor activo + countdown del auto-refresh |
| `GroupFilter.jsx` | Filtros de estado (Todos/En vivo/Próximos/Finalizados) y grupo (A–L) |
| `MatchCard.jsx` | Tarjeta completa de un partido: equipos, marcador, cuotas, análisis IA colapsable |
| `ProbabilityBar.jsx` | Barra segmentada Home/Draw/Away con porcentajes del modelo |
| `RiskBadge.jsx` | Badge dinámico de riesgo (Bajo/Medio/Alto) con icono Lucide |
| `StatPill.jsx` | Píldora de texto con ícono Sparkles para el insight estadístico clave |
| `TermTooltip.jsx` | Tooltip/glosario accesible (hover desktop + tap móvil) para términos de apuestas |
