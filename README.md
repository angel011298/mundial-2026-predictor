# 🏆 Mundial 2026 · Predictor

SPA **mobile-first** de predicciones y analítica deportiva interactiva, enfocada
**exclusivamente** en la Copa del Mundo FIFA 2026. Estética tipo *dashboard de
neobanco / trading premium*: fondo oscuro (zinc-950) con acentos esmeralda y
violeta eléctrico.

> ⚠️ **Juego responsable · +18.** Las probabilidades y montos sugeridos son
> analíticos/educativos y **no garantizan resultados**.

## ✨ Características

- **Botón “ACTUALIZAR EN TIEMPO REAL”** con animación de giro y sello de última sincronización.
- **Tarjetas analíticas interactivas** por partido con el *Motor de Consejos*:
  - Probabilidades Victoria/Empate/Victoria (distribución implícita normalizada, sin margen de la casa).
  - **Nivel de Riesgo** dinámico (Bajo/Medio/Alto) por entropía + volatilidad + disparidad.
  - **Monto recomendado** vía **Criterio de Kelly** fraccionario (¼ Kelly, tope 8% del bankroll).
  - **Píldora de estadística clave** generada dinámicamente.
- Filtros por estado (en vivo / próximos / finalizados) y por grupo (A–L).
- 100% estático → desplegable gratis en **Vercel** o **Netlify**, soporta tráfico masivo.

## 🚀 Puesta en marcha

```bash
npm install
npm run dev        # http://localhost:5173  (host:true → accesible desde el móvil)
npm run build      # genera /dist
npm run preview    # sirve el build de producción
```

Sin claves de API, la app arranca en **modo DEMO** con datos simulados realistas.

## 🔌 Conectar APIs reales

Copia `.env.example` a `.env` y elige proveedor:

| Variable | Descripción |
|---|---|
| `VITE_DATA_PROVIDER` | `mock` · `odds-api` · `api-football` |
| `VITE_ODDS_API_KEY` | Clave de [The Odds API](https://the-odds-api.com/) (cuotas) |
| `VITE_API_FOOTBALL_KEY` | Clave de [API-Football](https://www.api-football.com/) (marcadores/estadísticas) |

Los adaptadores y la normalización viven en
[`src/services/sportsApiService.js`](src/services/sportsApiService.js). Todos los
proveedores devuelven el **mismo esquema `Match`**, así que la UI y el motor de
consejos no cambian al cambiar de fuente.

### 🔐 Seguridad de claves (importante)

En una SPA estática, cualquier `VITE_*` queda **expuesta** en el bundle. Para
producción real, no pongas la clave en el cliente: crea un **proxy Serverless**
(Vercel Functions / Netlify Functions / Edge) que guarde la clave del lado del
servidor y reenvíe la petición. La arquitectura ya está lista para apuntar el
`fetch` del servicio a `/api/odds` en lugar de al proveedor directo.

## 🗂️ Estructura

```
src/
├── data/worldcup2026.json     # Estructura del torneo: 48 equipos, 12 grupos A–L
├── services/sportsApiService.js  # Acceso a datos (mock / odds-api / api-football)
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
