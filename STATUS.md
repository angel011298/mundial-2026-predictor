# STATUS.md — Diagnóstico del proyecto (2026-06-20)

## ✅ Qué funciona

- **ESPN live data**: El Edge Function `/api/matches` obtiene partidos del día actual en tiempo real.
- **Auto-refresh inteligente**: 45s con partidos EN VIVO, 90s sin activos. Countdown visual en chip.
- **Calendario estático**: `worldcup2026.json → schedule` añade los fixtures futuros del Grupo A (juin 24/27) que ESPN no devuelve.
- **Normalización ESPN**: `normalizeESPNEvent` mapea 100+ nombres en inglés → español, extrae grupos de las notas ESPN, aplica fallback de fecha para matches cuyo status es ambiguo.
- **Motor de análisis** (`adviceEngine.js`): Kelly ¼ para stake sizing, probabilidades blend 55% mercado / 45% modelo, nivel de riesgo por entropía de Shannon, insight estadístico dinámico.
- **Filtros de estado y grupo**: Filtrado en memoria (sin re-fetch). Funcional para todos los 12 grupos.
- **MatchCard completo**: Cuotas con Pick badge, barra de probabilidades animada, análisis IA colapsable, tooltip de glosario en todos los términos técnicos.
- **Build limpio**: `npm run build` exitoso, 186 kB JS / 18 kB CSS (gzip: 60 kB / 4.5 kB).
- **Deploy continuo**: Vercel + GitHub, auto-deploy en push a master.
- **Mobile-first**: Safe area insets, header sticky, scrollbars ocultos, max-w-md.

## ⚠️ Qué está a medias

### Calendario estático incompleto y con equipos incorrectos
Solo 4 grupos tienen fixtures estáticos. Los entries de Grupos D, H, K usan equipos **adivinados** que no están en `worldcup2026.json`:

| Grupo | Equipos en schedule | ¿En JSON? | Problema |
|---|---|---|---|
| D | Eslovenia, Panamá | No / Sí (Panamá en B, no D) | Eslovenia → ⚽ #50 FIFA |
| H | Brasil, Irak, Haití, Tanzania | Irak/Haití/Tanzania no en JSON | → ⚽ #50 FIFA |
| K | Italia, Paraguay, Sierra Leona | Paraguay no en K del JSON (está en L), Sierra Leona no en JSON | Grupos wrong |

**Grupos del JSON vs ESPN real (confirmados al 20-jun):**
- Grupo A: México, Corea del Sur, República Checa, Sudáfrica ✅ (confirmado por ESPN)
- Grupos B–L: datos pre-sorteo, pueden ser incorrectos

### Proveedor de cuotas sin integrar
`odds-api` y `api-football` están codificados pero nunca probados. Sin API keys configuradas, siempre caen al fallback demo. Las cuotas mostradas son **estimaciones del modelo**, no cuotas reales de bookmakers.

### `volatility` siempre en 0
El campo `volatility` existe en el esquema pero ningún proveedor lo popula. El engine de riesgo lo usa (`0.3 * vol`) pero nunca aporta señal real.

## 🐛 Bugs detectados

### 1. Import `Info` al final de `MatchCard.jsx`
`src/components/MatchCard.jsx:322` — `import { Info } from 'lucide-react'` está al final del archivo, fuera del bloque de imports. Funciona gracias al hoisting de ES modules en Vite, pero es un code smell que rompe linters y confunde a herramientas de análisis.

**Fix**: Mover a la línea 1 junto con los demás imports.

### 2. `TermTooltip` duplica el label en el tooltip
`src/components/TermTooltip.jsx:50-52` — Cuando se abre el tooltip, el `label` se renderiza dos veces: una vez antes del botón ℹ️ y otra dentro del bubble como `<span className="font-bold">{label}</span>`. Si `label` es un ReactNode complejo (como `<RiskBadge>`), el resultado visual es incorrecto.

**Fix**: En el interior del bubble, usar solo texto plano o una prop `title` separada en vez de re-renderizar `label`.

### 3. Deduplicación por `code` falla para equipos no mapeados
`pairKey(m.home.code, m.away.code)` usa el campo `code` que, para equipos sin entrada en el JSON, es `apiName.slice(0,3).toUpperCase()`. Ej: "Sierra Leona" → "SIE". Si el mismo equipo aparece en ESPN con un nombre distinto (ej. "Sierra Leone"), el code sería diferente y el par no se deduplicaría.

### 4. Filtro `> now - 2h` permite mostrar fixtures como "upcoming" hasta 2h después del kickoff
`sportsApiService.js:392` — La condición es `new Date(m.kickoff) > new Date(Date.now() - 2 * 3600_000)`. El comentario dice ">2h en el futuro" pero en realidad permite partidos cuyo kickoff fue hace hasta 2 horas. Intencional para evitar que un partido desaparezca justo al inicio, pero sin NFL correcto puede mantener fixtures estáticos como "upcoming" durante el primer tiempo.

### 5. Sin Error Boundary en React
Si cualquier componente lanza una excepción (ej. `analyzeMatch` con datos inesperados), la app muestra pantalla en blanco. No hay `<ErrorBoundary>` en `App.jsx`.

## ❌ Qué falta (no implementado)

- **Fase eliminatoria / brackets**: No hay vista de Ronda de 32, Octavos, Cuartos, Semis, Final.
- **Cuotas reales de bookmaker**: The Odds API / Betfair / Pinnacle sin integrar.
- **Historial de picks del usuario**: No hay persistencia de picks locales.
- **Bankroll tracker**: El usuario no puede registrar su bankroll ni calcular el stake en dinero real.
- **Compartir partido**: Sin botón de share/copy.
- **PWA / offline**: Sin service worker. App no funciona sin conexión.
- **Notificaciones push**: No hay alertas cuando un partido inicia.
- **Búsqueda de equipos**: No hay búsqueda por nombre de equipo.
- **Standings / tabla de grupos**: No se muestra la tabla de posiciones por grupo.
- **Calendario completo de los 48 equipos**: `worldcup2026.json` tiene solo los fixtures de los grupos confirmados; faltan ~100 partidos del torneo completo.
- **Dark/light mode**: Solo modo oscuro.

## 📋 Deuda técnica prioritaria

1. Mover `import { Info }` al top de `MatchCard.jsx` (trivial, 30 seg)
2. Confirmar y corregir grupos D, H, K en `worldcup2026.json` con datos reales de ESPN
3. Añadir equipos faltantes al JSON: Haití, Irak, Tanzania, Sierra Leona, Eslovenia + otros
4. Expandir `schedule` al calendario completo de los 48 equipos conforme ESPN publique datos
5. Integrar al menos una fuente de cuotas reales (The Odds API tiene plan gratuito)
6. Añadir `<ErrorBoundary>` en `App.jsx`
