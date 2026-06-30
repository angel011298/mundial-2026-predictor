/**
 * tournamentWorker.js — Web Worker para el Simulador Monte Carlo
 *
 * Corre el bucle completo grupo→bracket en un hilo separado y postea mensajes
 * de progreso cada BATCH iteraciones para mantener la barra de progreso fluida.
 *
 * Protocolo de mensajes:
 *   IN  → { groups, nIterations, seed }
 *   OUT ← { type: 'progress', done, total }
 *       ← { type: 'done', results: Record<code, TeamResult> }
 *       ← { type: 'error', message: string }
 */

import {
  mulberry32,
  simulateGroup,
  rankBestThirds,
  simulateBracket,
} from '../model/monteCarlo.js';

const BATCH    = 500; // iteraciones entre progress posts
const GLETTERS = 'ABCDEFGHIJKL'.split('');

self.onmessage = async function ({ data: { groups, nIterations, seed } }) {
  // ── Contadores acumulados ─────────────────────────────────────────
  const acc = new Map();
  for (const g of groups) {
    for (const t of g.teams) {
      acc.set(t.code, {
        groupId:       g.id,
        name:          t.name,
        flag:          t.flag,
        advanceCount:  0,
        r16Count:      0,
        qfCount:       0,
        sfCount:       0,
        finalCount:    0,
        championCount: 0,
        posDist:       [0, 0, 0, 0],
      });
    }
  }

  const rng  = mulberry32(seed);
  let   done = 0;

  try {
    while (done < nIterations) {
      const batchEnd = Math.min(done + BATCH, nIterations);

      // ── Un bloque de BATCH iteraciones ────────────────────────────
      for (let iter = done; iter < batchEnd; iter++) {
        // Fase de grupos
        const allGroupResults = groups.map(g => simulateGroup(g, rng));

        // Posiciones
        for (let gi = 0; gi < groups.length; gi++) {
          const ranked = allGroupResults[gi];
          for (let pos = 0; pos < 4; pos++) {
            acc.get(ranked[pos].team.code).posDist[pos]++;
          }
        }

        // Mejores terceros
        const bestThirds = rankBestThirds(allGroupResults, rng);
        const thirdSet   = new Set(bestThirds.map(s => s.team.code));

        // Conteo de clasificados
        for (let gi = 0; gi < groups.length; gi++) {
          const ranked = allGroupResults[gi];
          acc.get(ranked[0].team.code).advanceCount++;
          acc.get(ranked[1].team.code).advanceCount++;
          if (thirdSet.has(ranked[2].team.code)) {
            acc.get(ranked[2].team.code).advanceCount++;
          }
        }

        // Armar mapa qualified
        const qualified = {};
        for (let gi = 0; gi < 12; gi++) {
          const gl = GLETTERS[gi];
          qualified[`1${gl}`] = allGroupResults[gi][0].team;
          qualified[`2${gl}`] = allGroupResults[gi][1].team;
        }
        for (let i = 0; i < 8; i++) {
          qualified[`T${i + 1}`] = bestThirds[i].team;
        }

        // Fase eliminatoria
        const { nodes } = simulateBracket(qualified, rng);
        for (const node of nodes) {
          if (!node.result) continue;
          const a = acc.get(node.result.winner.code);
          if (!a) continue;
          switch (node.round) {
            case 'R32': a.r16Count++;      break;
            case 'R16': a.qfCount++;       break;
            case 'QF':  a.sfCount++;       break;
            case 'SF':  a.finalCount++;    break;
            case 'F':   a.championCount++; break;
          }
        }
      }

      done = batchEnd;
      self.postMessage({ type: 'progress', done, total: nIterations });

      // Cede el event loop para que el mensaje llegue al hilo principal
      if (done < nIterations) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    // ── Calcular probabilidades finales ───────────────────────────────
    const N = nIterations;
    const results = {};

    for (const [code, a] of acc) {
      const props = {
        pAdvance:  a.advanceCount  / N,
        pR16:      a.r16Count      / N,
        pQF:       a.qfCount       / N,
        pSF:       a.sfCount       / N,
        pFinal:    a.finalCount    / N,
        pChampion: a.championCount / N,
      };
      const se = {};
      for (const [k, v] of Object.entries(props)) {
        se[k] = Math.sqrt(v * (1 - v) / N);
      }
      results[code] = {
        code,
        name:         a.name,
        flag:         a.flag,
        groupId:      a.groupId,
        ...props,
        groupPosDist: a.posDist.map(c => c / N),
        se,
      };
    }

    self.postMessage({ type: 'done', results });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
