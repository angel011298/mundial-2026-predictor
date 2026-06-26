import { describe, test, expect } from 'vitest';
import {
  makeRng,
  samplePoisson,
  deriveLambdas,
  sampleMatch,
  GAMMA,
} from '../monteCarlo.js';

// ─── makeRng ────────────────────────────────────────────────────
describe('makeRng', () => {
  test('misma seed → misma secuencia', () => {
    const r1 = makeRng(42);
    const r2 = makeRng(42);
    const seq1 = Array.from({ length: 20 }, () => r1());
    const seq2 = Array.from({ length: 20 }, () => r2());
    expect(seq1).toEqual(seq2);
  });

  test('seeds distintas → secuencias distintas', () => {
    const seq1 = Array.from({ length: 10 }, makeRng(1));
    const seq2 = Array.from({ length: 10 }, makeRng(2));
    expect(seq1).not.toEqual(seq2);
  });

  test('salida en [0, 1)', () => {
    const rng = makeRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('secuencia progresa (sin repetición inmediata)', () => {
    const rng = makeRng(123);
    const a = rng(), b = rng();
    expect(a).not.toBe(b);
  });
});

// ─── samplePoisson ──────────────────────────────────────────────
describe('samplePoisson', () => {
  test('media ≈ lambda con 100k draws (±2%)', () => {
    const rng = makeRng(12345);
    const lambda = 2.5;
    const N = 100_000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += samplePoisson(lambda, rng);
    const mean = sum / N;
    // ±2% de 2.5 = ±0.05; toBeCloseTo con 1 decimal = ±0.05
    expect(mean).toBeCloseTo(lambda, 1);
  });

  test('devuelve enteros no negativos ≤ 12', () => {
    const rng = makeRng(1);
    for (let i = 0; i < 1000; i++) {
      const k = samplePoisson(1.5, rng);
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(12);
    }
  });

  test('lambda ≈ 0 → casi todo ceros', () => {
    const rng = makeRng(7);
    const N = 2000;
    let zeros = 0;
    for (let i = 0; i < N; i++) if (samplePoisson(0.01, rng) === 0) zeros++;
    expect(zeros / N).toBeGreaterThan(0.98);
  });

  test('lambda alto → media alta', () => {
    const rng = makeRng(88);
    const N = 50_000;
    const lambda = 5.0;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += samplePoisson(lambda, rng);
    expect(sum / N).toBeCloseTo(lambda, 1);
  });

  test('determinista: misma función rng → mismo resultado', () => {
    const r1 = makeRng(555);
    const r2 = makeRng(555);
    expect(samplePoisson(2.0, r1)).toBe(samplePoisson(2.0, r2));
  });
});

// ─── deriveLambdas ──────────────────────────────────────────────
describe('deriveLambdas', () => {
  const avg = { code: 'ARG', attack: 1.0, defense: 1.0, elo: 1500, form: '' };

  test('equipos simétricos sin sede → lamH ≈ lamA', () => {
    const neutral = { ...avg, code: 'ARG' };
    const [lH, lA] = deriveLambdas(neutral, neutral, {});
    expect(lH).toBeCloseTo(lA, 3);
  });

  test('sede (USA) → lamH > lamA', () => {
    const host = { ...avg, code: 'USA' };
    const [lH, lA] = deriveLambdas(host, avg, {});
    expect(lH).toBeGreaterThan(lA);
  });

  test('CAN y MEX también reciben ventaja de sede', () => {
    for (const code of ['CAN', 'MEX']) {
      const host = { ...avg, code };
      const [lH, lA] = deriveLambdas(host, avg, {});
      expect(lH).toBeGreaterThan(lA);
    }
  });

  test('mayor Elo → mayor lambda (equipo fuerte es local sin sede)', () => {
    const strong = { ...avg, elo: 1800 };
    const weak   = { ...avg, elo: 1200 };
    const [lS, lW] = deriveLambdas(strong, weak, {});
    expect(lS).toBeGreaterThan(lW);
  });

  test('mejor ataque → lambda más alta', () => {
    const attacker = { ...avg, attack: 1.5 };
    const [lA] = deriveLambdas(attacker, avg, {});
    const [lN] = deriveLambdas(avg, avg, {});
    expect(lA).toBeGreaterThan(lN);
  });

  test('mejor defensa del rival → lambda local menor', () => {
    const solid = { ...avg, defense: 0.6 }; // concede menos
    const [lVsSolid] = deriveLambdas(avg, solid, {});
    const [lVsAvg]   = deriveLambdas(avg, avg, {});
    expect(lVsSolid).toBeLessThan(lVsAvg);
  });

  test('clamp: lambdas dentro de [0.15, 6]', () => {
    const monster = { code: 'X', attack: 10, defense: 0.05, elo: 2500, form: 'WWWWW' };
    const minnow  = { code: 'Y', attack: 0.05, defense: 10, elo: 500, form: 'LLLLL' };
    const [lH, lA] = deriveLambdas(monster, minnow, {});
    expect(lH).toBeLessThanOrEqual(6);
    expect(lA).toBeGreaterThanOrEqual(0.15);
  });

  test('fallbacks: equipo sin attack/defense/elo → no lanza', () => {
    const bare = { code: 'ZZZ' };
    expect(() => deriveLambdas(bare, bare, {})).not.toThrow();
    const [lH, lA] = deriveLambdas(bare, bare, {});
    expect(lH).toBeGreaterThan(0);
    expect(lA).toBeGreaterThan(0);
  });
});

// ─── sampleMatch ────────────────────────────────────────────────
describe('sampleMatch', () => {
  const team = { code: 'BRA', attack: 1.2, defense: 0.85, elo: 1750, form: 'WWDWW' };
  const opp  = { code: 'CMR', attack: 0.7, defense: 1.3,  elo: 1350, form: 'LLWLD' };

  test('devuelve enteros gh y ga ≥ 0', () => {
    const rng = makeRng(55);
    const { gh, ga } = sampleMatch(team, opp, {}, rng);
    expect(Number.isInteger(gh)).toBe(true);
    expect(Number.isInteger(ga)).toBe(true);
    expect(gh).toBeGreaterThanOrEqual(0);
    expect(ga).toBeGreaterThanOrEqual(0);
  });

  test('determinista con misma seed', () => {
    const r1 = makeRng(777);
    const r2 = makeRng(777);
    expect(sampleMatch(team, opp, {}, r1)).toEqual(sampleMatch(team, opp, {}, r2));
  });

  test('el favorito Elo gana más seguido en 1000 partidos', () => {
    const rng = makeRng(42);
    const strong = { code: 'ARG', attack: 1.5, defense: 0.7, elo: 1900, form: 'WWWWW' };
    const weak   = { code: 'AND', attack: 0.4, defense: 1.8, elo: 900,  form: 'LLLLL' };
    let winsStrong = 0;
    for (let i = 0; i < 1000; i++) {
      const { gh, ga } = sampleMatch(strong, weak, {}, rng);
      if (gh > ga) winsStrong++;
    }
    // El fuerte debería ganar al menos el 60% de las veces
    expect(winsStrong / 1000).toBeGreaterThan(0.6);
  });
});

// ─── Constantes exportadas ──────────────────────────────────────
describe('GAMMA', () => {
  test('es un número positivo exportado', () => {
    expect(typeof GAMMA).toBe('number');
    expect(GAMMA).toBeGreaterThan(0);
    expect(GAMMA).toBeLessThan(1);
  });
});
