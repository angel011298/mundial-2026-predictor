# Diseño — Simulador Monte Carlo del Mundial 2026

> **Estado:** diseño aprobado para revisión · sin implementar.
> **Formato del torneo:** 48 selecciones · 12 grupos de 4 · 1º + 2º + 8 mejores terceros → Ronda de 32 → R16 → Cuartos → Semis → Final.
> **Objetivo:** estimar, por simulación, la probabilidad de cada selección de superar la fase de grupos y alcanzar cada ronda hasta ganar la copa.

Este documento define **estructura de datos, orden de simulación y salidas agregadas**. No incluye código de producción; los bloques en JS son pseudocódigo de referencia.

---

## 1. Principio del modelo

Cada partido se resuelve **muestreando goles** con dos Poisson independientes:

```
goles_local   ~ Poisson(λ_local)
goles_visita  ~ Poisson(λ_visita)
```

Los `λ` salen de las fuerzas ajustadas en `teamStrength.json` (Fase 2 del plan histórico), con el **ajuste de localía/Elo** que ya usa el blend existente. A diferencia de `dixonColesProbs()` —que colapsa la matriz a probabilidades 1X2— el simulador **necesita el marcador concreto** para acumular diferencia de gol y goles a favor (claves de desempate). Por eso el MC opera a nivel de goles, no de probabilidades.

> ⚠️ El `poisson(λ, k)` de `src/model/dixonColes.js` es la **función de masa** (devuelve 0 para `k ≥ 8`). El simulador requiere un **muestreador** aparte (algoritmo de Knuth), sin tope práctico en goles.

---

## 2. Entradas (artefactos de datos)

| Archivo | Origen | Forma | Uso |
|---|---|---|---|
| `teamStrength.json` | Fase 2 plan histórico | `{ [code]: { attack, defense, elo, homeAdv, form, avgGF, avgGA, matches } }` | Derivar λ por partido |
| `shootoutRates.json` | Fase 2 plan histórico | `{ [code]: { rate, n } }` | Resolver empates en eliminatorias |
| `worldcup2026.json → groups` | Estático (ya existe) | `[{ id:'A', teams:[{name,code,flag,...}] }]` | Composición de los 12 grupos |
| `bracketTemplate.json` | Nuevo (estático) | Ver §6 | Mapear clasificados → llaves R32 |
| `bestThirdMap.json` | Nuevo (estático) | Ver §5 | Asignar los 8 mejores terceros a sus slots |

**Convenciones de `teamStrength.json`:**
- `attack` / `defense` son multiplicadores **relativos al promedio** (1.0 = promedio mundial). Reemplazan a `avgGF/LEAGUE_AVG` y `avgGA/LEAGUE_AVG` de `dixonColesProbs`.
- `elo` es el rating histórico recalculado (consume `eloProbability`).
- `homeAdv` se reserva para sedes; en grupos/eliminatorias casi todos son neutrales salvo USA/CAN/MEX (`HOST_CODES`).

**Fallbacks** (equipo sin entrada): `attack=defense=1.0`, `elo=1500`, `shootoutRate=0.5`.

---

## 3. Motor de partido (`sampleMatch`)

### 3.1 Derivación de λ

Reusa la **misma estructura** de `dixonColesProbs` pero con fuerzas ajustadas y un *tilt* de Elo que incorpora el ajuste del blend al nivel de goles:

```js
// LEAGUE_AVG = 1.32 (de dixonColes.js)   ELO_DIVISOR = 400 (de elo.js)
function deriveLambdas(H, A, ctx) {
  const homeAdv = HOST_CODES.has(H.code) ? 1.12 : 1.0;     // HOST_ADV existente
  const fmH = formMultiplier(H.form), fmA = formMultiplier(A.form);

  // Base Dixon-Coles con fuerzas ajustadas (attack/defense ya relativas a 1.0)
  let lamH = H.attack * A.defense * LEAGUE_AVG * homeAdv * fmH;
  let lamA = A.attack * H.defense * LEAGUE_AVG * fmA;

  // Ajuste Elo (localía ya incluida vía homeAdv → no se duplica en eloDiff)
  const eloDiff = (H.elo - A.elo) + (HOST_CODES.has(H.code) ? 100 : 0); // HOME_ADV_ELO
  const tilt = Math.exp(GAMMA * eloDiff / 400);   // GAMMA ≈ 0.15 (calibrable)
  lamH *= Math.sqrt(tilt);
  lamA /= Math.sqrt(tilt);

  return [clamp(lamH, 0.15, 6), clamp(lamA, 0.15, 6)];
}
```

- El *tilt* sube λ del favorito por Elo y baja la del rival **conservando el total de goles** aproximado (multiplicar por `√tilt` / dividir por `√tilt`).
- `GAMMA` se **calibra** para que el 1X2 implícito del muestreo ≈ `blendProbabilities` con `DEFAULT_WEIGHTS`. Se valida en el backtest (Fase 7 del plan histórico).
- La señal de **mercado** del blend no aplica en partidos hipotéticos (no hay cuotas para un Brasil–Francia que aún no existe), por eso el MC mezcla solo DC+Elo. Documentado como decisión.

### 3.2 Muestreo de goles (Knuth) + RNG sembrable

```js
function makeRng(seed) {                 // mulberry32: determinista y rápido
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function samplePoisson(lambda, rng) {    // Knuth (ok para λ < ~30)
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return Math.min(k - 1, 12);            // tope defensivo
}

function sampleMatch(H, A, ctx, rng) {
  const [lamH, lamA] = deriveLambdas(H, A, ctx);
  return { gh: samplePoisson(lamH, rng), ga: samplePoisson(lamA, rng) };
}
```

**Determinismo:** una `seed` fija reproduce la corrida completa. La salida reporta la `seed` usada.

---

## 4. Fase de grupos

### 4.1 Round-robin

Cada grupo de 4 → **6 partidos** (todas las parejas, `C(4,2)`). Local/visita según el calendario oficial cuando exista; si no, orden fijo del JSON.

```js
const GROUP_FIXTURES = [[0,1],[2,3],[0,2],[1,3],[0,3],[1,2]]; // índices dentro del grupo
```

Acumulación por equipo: `P (puntos), W, D, L, GF, GA, GD`. Puntos: V=3, E=1, D=0.

### 4.2 Condicionamiento con datos en vivo (opcional pero recomendado)

Si un partido del grupo ya tiene marcador final (`status==='finished'` en los `matches` cargados), se **usa el resultado real** en vez de muestrear. Así la simulación se vuelve *condicional* y converge a la realidad a medida que avanza el torneo. Se pasa un mapa `playedResults[pairKey] = {gh, ga}`.

### 4.3 Reglas de desempate (orden FIFA 2026)

Aplicadas en cascada sobre los empatados:

1. **Puntos** en todos los partidos del grupo
2. **Diferencia de gol** general
3. **Goles a favor** generales
4. Si persiste el empate entre 2+ equipos, se repite **solo entre ellos** (head-to-head):
   a. Puntos en los partidos entre los empatados
   b. Diferencia de gol entre los empatados
   c. Goles a favor entre los empatados
5. *(Fair play — no modelado: no simulamos tarjetas)*
6. **Sorteo** → desempate aleatorio con el RNG sembrado

```js
function rankGroup(teams, matches, rng) {
  // 1ª pasada: puntos, GD, GF (global)
  // detectar bloques aún empatados → re-ordenar por mini-liga head-to-head
  // resto → rng() como "sorteo"
}
```

Salida por grupo: `[1º, 2º, 3º, 4º]` con sus líneas de estadística (necesarias para rankear terceros).

---

## 5. Mejores terceros (8 de 12)

1. Tomar el 3º de cada grupo → 12 candidatos.
2. Ordenar por **Puntos → GD → GF → sorteo** (idéntico criterio global).
3. Los **8 primeros** clasifican.
4. **Asignación a slots:** qué grupo-tercero va a qué llave de R32 depende de *cuál combinación* de grupos aportó terceros. FIFA publica una **tabla de combinaciones** (C(12,8) restringida a las combinaciones válidas del fixture). Se modela como lookup:

```js
// bestThirdMap.json: clave = combinación ordenada de grupos clasificados, valor = asignación a slots
// { "ABCDEFGH": { "W1": "3A", "W2": "3B", ... }, ... }
```

> **Decisión abierta (ver §13):** la tabla oficial es grande. Para v1 se permite un **fallback simplificado** — rankear los 8 terceros y asignarlos a los slots `3-x` del template en orden de ranking. Introduce un sesgo menor en el cruce exacto pero **no afecta** P(superar grupos) ni materialmente las P de rondas avanzadas. La tabla oficial se incorpora en una iteración posterior.

---

## 6. Estructura del bracket

El bracket es un **árbol binario** de 5 niveles. Se representa con un *template* estático (referencias a clasificados) y un *árbol de nodos* que se rellena en cada iteración.

### 6.1 Template estático (`bracketTemplate.json`)

Cada llave de R32 referencia dos **fuentes de clasificación** (`1A`=1º grupo A, `2B`=2º grupo B, `3CDFG`=mejor tercero del conjunto…). Ejemplo de slot:

```json
{
  "round": "R32",
  "matches": [
    { "id": "m32_1", "home": "1A", "away": "3CDFG", "feedsInto": "m16_1", "slot": "home" },
    { "id": "m32_2", "home": "1C", "away": "2D",    "feedsInto": "m16_1", "slot": "away" }
  ]
}
```

`feedsInto` + `slot` codifican la topología: el ganador de `m32_1` ocupa el `home` de `m16_1`, etc. Esto evita hardcodear el árbol y permite recorrerlo genéricamente.

### 6.2 Árbol en memoria (por iteración)

```js
// KnockoutNode
{
  id: 'm16_1',
  round: 'R16',          // 'R32'|'R16'|'QF'|'SF'|'F'
  home: TeamRef|null,    // null hasta que el partido previo lo resuelva
  away: TeamRef|null,
  result: { gh, ga, winner, viaPenalties } | null,
  feedsInto: 'mqf_1',
  slot: 'home',
}
```

Los 31 nodos (16+8+4+2+1) se crean vacíos y se rellenan en orden topológico.

---

## 7. Eliminatorias (resolución de empates)

```js
function playKnockout(node, ctx, rng) {
  let { gh, ga } = sampleMatch(node.home, node.away, ctx, rng);

  if (gh === ga) {
    // Prórroga: 30' extra ≈ λ * (30/90)
    const [lh, la] = deriveLambdas(node.home, node.away, ctx).map(l => l * 30/90);
    gh += samplePoisson(lh, rng); ga += samplePoisson(la, rng);
  }

  let winner, viaPenalties = false;
  if (gh > ga) winner = node.home;
  else if (ga > gh) winner = node.away;
  else {
    // Penales: probabilidad ∝ tasa histórica de cada uno
    const rH = shootoutRates[node.home.code]?.rate ?? 0.5;
    const rA = shootoutRates[node.away.code]?.rate ?? 0.5;
    const pHome = rH / (rH + rA);            // normalización simple
    winner = rng() < pHome ? node.home : node.away;
    viaPenalties = true;
  }
  node.result = { gh, ga, winner, viaPenalties };
  return winner;
}
```

- Prórroga modelada como Poisson reducido (factor 30/90); puede desactivarse con flag para ir directo a penales (más veloz, sesgo despreciable).
- Penales: `pHome = rateH / (rateH + rateA)`. Si faltan ambos ⇒ 0.5. Alternativa logística documentada como refinamiento.

---

## 8. Orden de simulación

```
runMonteCarlo(config, iterations = 10000, seed = 20260611):
  rng = makeRng(seed)
  tally = initTally(48 selecciones)   // contadores por ronda alcanzada

  repeat iterations:
    # A — Grupos
    for g in 12 grupos:
       standings[g] = rankGroup(simulateRoundRobin(g, rng), rng)
       marcar 1º y 2º como "supera grupos"
    # B — Mejores terceros
    thirds = rankThirds(standings)         # top 8
    marcar esos 8 como "supera grupos"
    # C — Construir R32 desde template + (1º,2º,terceros)
    bracket = fillBracket(bracketTemplate, standings, thirds)
    # D — Eliminatorias en orden topológico
    for node in [R32 → R16 → QF → SF → F]:
       winner = playKnockout(node, ctx, rng)
       propagar winner a node.feedsInto[slot]
       tally[winner].reach[node.round.next] += 1
    tally[campeón].champion += 1

  return aggregate(tally, iterations, seed)
```

**Complejidad:** 72 partidos de grupo + 31 de eliminatoria = **103 muestreos/iteración**. A 10 000 iteraciones → ~1,03 M de partidos (2 draws Poisson c/u). Se ejecuta en un **Web Worker** (§10) en ~1–2 s; 50 000 iteraciones en pocos segundos.

---

## 9. Salidas agregadas (por selección)

Tras `N` iteraciones, cada contador se divide por `N`:

```js
// SimulationResult
{
  iterations: 10000,
  seed: 20260611,
  generatedAt: '2026-06-23T...Z',
  perTeam: {
    ARG: {
      pAdvance:  0.91,   // supera fase de grupos (1º, 2º o mejor tercero)
      pWinGroup: 0.58,   // termina 1º de su grupo
      pR16:      0.78,   // alcanza octavos
      pQF:       0.55,
      pSF:       0.34,
      pFinal:    0.21,
      pChampion: 0.124,  // gana la copa
      finishDist: { p1: 0.58, p2: 0.27, p3: 0.10, p4: 0.05 }, // posición en grupo
      seMax: 0.005       // error estándar máx ≈ sqrt(p(1-p)/N)
    },
    ...
  }
}
```

**Probabilidades reportadas (lo que pide el encargo):**
- `pAdvance` — **superar la fase de grupos**.
- `pR16, pQF, pSF, pFinal` — **alcanzar cada ronda**.
- `pChampion` — **ganar la copa**.
- Extras útiles: `pWinGroup`, distribución de posición de grupo, error estándar para indicar convergencia.

**Convergencia:** `SE(p) ≈ √(p(1−p)/N)`. Con N=10 000, SE ≤ 0,5 pp. Se muestra un aviso si el usuario pide menos de ~2 000 iteraciones.

**Sanidad:** Σ `pChampion` = 1 ; Σ `pAdvance` = 32 ; Σ `pR16` = 16 … (chequeos de invariantes para tests).

---

## 10. Arquitectura y ubicación de archivos

| Archivo | Rol | Toca React |
|---|---|---|
| `src/model/monteCarlo.js` | Motor puro: `makeRng`, `samplePoisson`, `sampleMatch`, `rankGroup`, `rankThirds`, `fillBracket`, `playKnockout`, `runMonteCarlo` | No |
| `src/data/bracketTemplate.json` | Topología R32→Final | No |
| `src/data/bestThirdMap.json` | Tabla de terceros (o fallback) | No |
| `src/workers/montecarlo.worker.js` | Corre `runMonteCarlo` fuera del hilo principal; emite progreso | No |
| `src/hooks/useMonteCarlo.js` | Lanza el worker, expone `{ run, progress, result, isRunning }` | Hook |
| `src/components/SimulatorView.jsx` | Nueva pestaña "Simulador 🎲": botón correr, slider de iteraciones, tabla ordenable de probabilidades con barras, badge de convergencia | Sí |
| `src/model/__tests__/monteCarlo.test.js` | Tests deterministas (ver §11) | No |

- **Web Worker nativo** (sin dependencias — respeta CLAUDE.md "nada de dependencias pesadas").
- Se añade un ítem a `ViewTabs.jsx` (`{ id:'simulator', label:'Simulador', emoji:'🎲' }`).
- El motor es 100% puro y testeable en Vitest sin DOM.

---

## 11. Determinismo, rendimiento y testing

**Tests (Vitest):**
- `samplePoisson`: media de 100 k draws ≈ λ (±2 %).
- `makeRng`: misma seed ⇒ misma secuencia.
- `rankGroup`: casos de desempate (puntos iguales → GD → GF → head-to-head) con fixtures fijos.
- `runMonteCarlo(seed)` determinista: dos corridas con misma seed ⇒ resultado idéntico.
- Invariantes: Σ`pChampion`≈1, Σ`pAdvance`≈32 (tolerancia por MC).
- Sanidad de favoritos: con `teamStrength` real, top-5 Elo deben tener `pChampion` decreciente y coherente.

**Rendimiento:** memoizar `deriveLambdas` por par ordenado dentro de una iteración de grupo (los 6 fixtures son fijos). Worker chunked: emite progreso cada ~500 iteraciones para la barra.

---

## 12. Casos borde

- **Grupos sin sortear / placeholders:** si faltan equipos reales, simular igual con fuerzas neutras; marcar resultado como "ilustrativo".
- **teamStrength/​shootoutRates ausente:** fallbacks de §2.
- **Empate irresoluble en grupo:** sorteo con RNG (reproducible).
- **Datos en vivo parciales:** mezclar partidos jugados (reales) con pendientes (muestreados) — §4.2.

---

## 13. Plan de implementación (posterior, con modelos Claude)

| Fase | Entregable | Modelo | Motivo |
|---|---|---|---|
| MC-1 | `monteCarlo.js`: RNG, sampler, `sampleMatch`, `deriveLambdas` + tests del sampler | **Opus 4.8** | Corrección probabilística crítica |
| MC-2 | `rankGroup` + desempates FIFA + `rankThirds` + tests | **Opus 4.8** | Lógica de reglas sensible |
| MC-3 | `bracketTemplate.json` + `fillBracket` + `playKnockout` (ET/penales) | **Sonnet 4.6** | Estructura + integración |
| MC-4 | `runMonteCarlo` + agregación + invariantes | **Sonnet 4.6** | Orquestación |
| MC-5 | Worker + `useMonteCarlo` + `SimulatorView` + tab | **Sonnet 4.6** | UI/integración |
| MC-6 | Calibración de `GAMMA` contra el blend/backtest | **Opus 4.8** | Ajuste matemático |

Cada fase compila y deja los tests verdes antes de commitear.

---

## 14. Decisiones resueltas

1. **Tabla de terceros — resolución:** El criterio para *quién pasa* usa el cascade oficial completo (Pts → DG → GF → fair play → sorteo). Para *a qué cruce va* cada tercero, la v1 usa el **fallback por ranking** (los 8 mejores terceros asignados en orden a los slots `3-x` del template). El código lo expone como `THIRD_SLOT_MODE = 'ranking'` y la UI muestra el aviso _"la asignación real de terceros puede variar"_. La tabla oficial de combinaciones se incorpora en una iteración posterior cuando FIFA la publique en formato procesable.

2. **Prórroga — resolución:** Se modela con Poisson reducido (factor ×30/90) tal como diseña §7. Los 30 minutos extra se muestrean independientemente y se suman al marcador regular. Solo si persiste el empate se pasa a penales. El flag `ET_ENABLED = true` permite desactivar la prórroga para testing de velocidad.

3. **GAMMA — resolución:** Valor provisional `GAMMA = 0.15` fijado como constante exportada en `src/model/monteCarlo.js`. Se añade a la lista de parámetros calibrables de `scripts/backtest.mjs` (Fase 7 del plan histórico). No bloquea la implementación; el valor se ajustará cuando el dataset de backtest esté disponible. La constante vive en un único lugar para facilitar ese ajuste futuro.

4. **Iteraciones — resolución:** Default **10 000** (SE ≤ 0,5 pp, ~1–2 s en worker). La UI expondrá un selector hasta **50 000** iteraciones etiquetado _"Alta precisión (~5–10 s)"_ con un aviso de consumo de batería en móvil. La agregación es en streaming (el worker emite progreso cada ~500 iteraciones) y nunca acumula en memoria las corridas individuales, solo los contadores por equipo.
