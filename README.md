# 🏆 Mundial 2026 · Predictor

SPA **mobile-first** de predicciones y analítica deportiva interactiva, enfocada **exclusivamente** en la Copa del Mundo FIFA 2026. Estética tipo *dashboard de neobanco / trading premium*: fondo oscuro (zinc-950) con acentos esmeralda y violeta eléctrico.

> ⚠️ **Juego responsable · +18.** Las probabilidades y montos sugeridos son analíticos/educativos y **no garantizan resultados**. No es asesoramiento financiero.

## ✨ Características Phase 5 (Completo)

### 📊 Análisis & Predicción
- **Motor IA**: blend Dixon-Coles (40%) + Elo (25%) + Consenso mercado (35%)
- **Value betting**: cálculo EV%, recomendaciones stake ¼-Kelly con tope 8%
- **Tarjetas expandibles** por partido: cuotas, análisis, sliders what-if, heatmap Poisson, comparador casas
- **Scorecard del modelo**: Brier score, % acierto 1X2, ROI value bets, historial predicciones

### 🎮 Navegación Interactiva
- **4 vistas**: Partidos | Grupos (12 tablas) | Bracket (R32→Final) | Mis Picks (scorecard + bankroll)
- **Filtros**: estado (en vivo/próximos/finalizados) + grupo (A–L) con deep-link URL
- **Perfiles de equipo**: stats base, estadísticas del torneo, H2H vs rivales

### 💰 Bankroll & Picks
- **Bet Slip**: parlay multilegger con correlación, input bankroll, cálculo Kelly
- **Bankroll Tracker**: historial picks (W/L/PUSH), balance running, gráfico SVG P&L
- **localStorage**: persiste predicciones, picks, bankroll, límites

### 🛡️ Responsabilidad
- **Centro Juego Responsable**: FAB escudo, modal +18, timer sesión, 3 límites configurables
- **Links ayuda**: Jugadores Anónimos, GamCare, BeGambleAware
- **Accesibilidad**: aria-labels, focus trap, navegación teclado, colores semánticos

### 📱 PWA Instalable
- `manifest.json` Android/iOS, Service Worker offline, instalable como app standalone

## 🚀 Puesta en marcha

```bash
npm install
npm run dev        # http://localhost:5173  (host:true → accesible desde el móvil)
npm run build      # genera /dist
npm run preview    # sirve el build de producción
```

Sin claves de API, la app arranca en **modo DEMO** con datos simulados realistas.

## 🔌 Fuentes de datos y APIs

La capa de fusión (`src/services/dataFusion.js`) orquesta 7 fuentes en paralelo:

| Fuente | Tipo | Edge Function | Variable de entorno | Cache |
|---|---|---|---|---|
| ESPN scoreboard | Gratuita | `/api/matches` | — | 30 s |
| rezarahiminia/worldcup2026 | Gratuita | `/api/worldcup` | — | 6 h |
| eloratings.net (estático) | Gratuita | `/api/elo` | — | 24 h |
| API-Football v3 | 100 req/día | `/api/apifootball` | `API_FOOTBALL_KEY` | 2 h |
| BALLDONTLIE | Con clave | `/api/balldontlie` | `BALLDONTLIE_API_KEY` | 2 h |
| SportsGameOdds | Con clave | `/api/sportsgameodds` | `SPORTSGAMEODDS_API_KEY` | 3 h |
| OddsPapi | 250 req/mes | `/api/oddspapi` | `ODDSPAPI_API_KEY` | **12 h** |

Sin ninguna clave la app funciona con ESPN + rezarahiminia + Elo estático y cuotas del modelo interno.

Copia `.env.example` a `.env` y rellena sólo las claves que tengas.

### 🔐 Seguridad de claves

Las claves van en variables **sin prefijo `VITE_`** — solo se leen dentro de las
Vercel Edge Functions (`/api/*.js`, lado servidor), nunca en el bundle del navegador.

## 🗂️ Estructura

```
src/
├── data/worldcup2026.json     # Estructura del torneo: 48 equipos, 12 grupos A–L
├── services/dataFusion.js         # Fusión de 7 fuentes → esquema Match extendido
├── utils/
│   ├── adviceEngine.js        # Probabilidades, Kelly, riesgo, stat clave
│   └── format.js              # Helpers de formato y tonos de color
└── components/
    ├── Dashboard.jsx          # Orquestador principal
    ├── Header.jsx · RefreshButton.jsx · GroupFilter.jsx
    └── MatchCard.jsx · ProbabilityBar.jsx · RiskBadge.jsx · StatPill.jsx
```

## ☁️ Despliegue

**Vercel:** importa el repo → framework *Vite* (autodetectado, `vercel.json` incluido) → Deploy.
**Netlify:** Build `npm run build`, Publish `dist`.

Define las variables `VITE_*` en el panel de tu plataforma si usas APIs reales.

## 🛠️ Stack

Vite · React 18 · Tailwind CSS 3 · Lucide Icons.

---

*La estructura del torneo en `worldcup2026.json` es editable: actualízala para
reflejar el sorteo oficial y deja que los datos en vivo de la API completen el resto.*
