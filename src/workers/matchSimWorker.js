/**
 * matchSimWorker.js — Worker de simulación de partido puntual
 *
 * Reutiliza deriveLambdas + samplePoisson + mulberry32 de monteCarlo.js
 * en lugar de duplicar la lógica.
 *
 * IN  → { home: TeamStrength, away: TeamStrength, nSims: number, seed: number }
 * OUT ← { type: 'done', counts: Record<"h-a", number>, nSims, lambdaH, lambdaA }
 *       { type: 'error', message: string }
 */

import { mulberry32, deriveLambdas, samplePoisson } from '../model/monteCarlo.js';

self.onmessage = function ({ data: { home, away, nSims, seed } }) {
  try {
    const rng = mulberry32(seed);
    const [lamH, lamA] = deriveLambdas(home, away);
    const counts = {};

    for (let i = 0; i < nSims; i++) {
      const key = `${samplePoisson(lamH, rng)}-${samplePoisson(lamA, rng)}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }

    self.postMessage({ type: 'done', counts, nSims, lambdaH: lamH, lambdaA: lamA });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err) });
  }
};
