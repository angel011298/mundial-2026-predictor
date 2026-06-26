import { describe, test, expect } from 'vitest';
import {
  mulberry32,
  makeRng,
  samplePoisson,
  deriveLambdas,
  sampleMatch,
  simulateGroupMatch,
  simulateGroup,
  rankBestThirds,
  GAMMA,
} from '../monteCarlo.js';
import { LEAGUE_AVG } from '../dixonColes.js';

// ─── Helpers de test ────────────────────────────────────────────
const team = (code, overrides = {}) => ({
  code,
  attack: 1.0, defense: 1.0, elo: 1500, form: '',
  ...overrides,
});

// Fixture con 4 equipos y resultados inyectados como playedResults.
// teams = [A, B, C, D]  →  GROUP_FIXTURES: [0,1]=A:B, [2,3]=C:D,
//   [0,2]=A:C, [1,3]=B:D, [0,3]=A:D, [1,2]=B:C
function makePlayedResults(entries) {
  return new Map(entries.map(([h, a, gh, ga]) => [`${h}:${a}`, { gh, ga }]));
}

// ─── mulberry32 / makeRng ───────────────────────────────────────
describe('mulberry32', () => {
  test('makeRng es alias de mulberry32', () => {
    expect(makeRng).toBe(mulberry32);
  });

  test('misma seed → misma secuencia (mulberry32)', () => {
    const r1 = mulberry32(2026);
    const r2 = mulberry32(2026);
    const seq1 = Array.from({ length: 50 }, () => r1());
    const seq2 = Array.from({ length: 50 }, () => r2());
    expect(seq1).toEqual(seq2);
  });

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

  test('tilt=1 (Elo diff=0, sin sede) no altera la base DC', () => {
    // attack=defense=1, form='', no host → base = 1·1·LEAGUE_AVG·1·1 = LEAGUE_AVG.
    // Con Elo idéntico, tilt = exp(GAMMA·0/400) = 1 → λ no se desplaza.
    const team = { code: 'NEU', attack: 1.0, defense: 1.0, elo: 1500, form: '' };
    const [lH, lA] = deriveLambdas(team, team, {});
    expect(lH).toBeCloseTo(LEAGUE_AVG, 10);
    expect(lA).toBeCloseTo(LEAGUE_AVG, 10);
  });

  test('Elo idéntico pero ataques asimétricos: el tilt no interviene', () => {
    // Misma elo → tilt=1; cualquier diferencia en λ proviene solo de attack/defense.
    const strong = { code: 'AAA', attack: 1.4, defense: 0.9, elo: 1600, form: '' };
    const weak   = { code: 'BBB', attack: 0.8, defense: 1.1, elo: 1600, form: '' };
    const [lH, lA] = deriveLambdas(strong, weak, {});
    // lamH base = 1.4 · 1.1 · LEAGUE_AVG ; lamA base = 0.8 · 0.9 · LEAGUE_AVG
    expect(lH).toBeCloseTo(1.4 * 1.1 * LEAGUE_AVG, 10);
    expect(lA).toBeCloseTo(0.8 * 0.9 * LEAGUE_AVG, 10);
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

// ═══════════════════════════════════════════════════════════════════
// MC-2: simulateGroupMatch
// ═══════════════════════════════════════════════════════════════════
describe('simulateGroupMatch', () => {
  const home = team('ARG');
  const away = team('BRA');
  const rng  = makeRng(1);

  test('usa playedResults cuando la clave está presente', () => {
    const played = new Map([['ARG:BRA', { gh: 2, ga: 1 }]]);
    const result = simulateGroupMatch(home, away, rng, played);
    expect(result).toEqual({ gh: 2, ga: 1, fromReal: true });
  });

  test('samplea cuando la clave no está (fromReal=false)', () => {
    const result = simulateGroupMatch(home, away, makeRng(99), undefined);
    expect(result.fromReal).toBe(false);
    expect(Number.isInteger(result.gh)).toBe(true);
    expect(Number.isInteger(result.ga)).toBe(true);
  });

  test('resultado real no consume el RNG (reproducible después)', () => {
    const rng1 = makeRng(7);
    const rng2 = makeRng(7);
    const played = new Map([['ARG:BRA', { gh: 1, ga: 0 }]]);
    simulateGroupMatch(home, away, rng1, played); // consume played, no RNG
    simulateGroupMatch(home, away, rng1);          // samplea con rng1
    simulateGroupMatch(home, away, rng2);          // samplea con rng2 (misma pos)
    // Ambos samplers deben generar el mismo resultado
    const r1 = simulateGroupMatch(home, away, rng1);
    const r2 = simulateGroupMatch(home, away, rng2);
    expect(r1).toEqual(r2);
  });
});

// ═══════════════════════════════════════════════════════════════════
// MC-2: simulateGroup — cascade FIFA
// ═══════════════════════════════════════════════════════════════════
describe('simulateGroup', () => {
  // GROUP_FIXTURES con teams=[A,B,C,D]:
  //   [0,1]=A:B  [2,3]=C:D  [0,2]=A:C  [1,3]=B:D  [0,3]=A:D  [1,2]=B:C

  test('ganador claro sin empates (A primer, D último)', () => {
    // A beats all; B>C>D
    const [A, B, C, D] = ['AAA','BBB','CCC','DDD'].map(c => team(c));
    const group = { id: 'T', teams: [A, B, C, D] };
    const played = makePlayedResults([
      ['AAA','BBB', 3,0],  // A:B
      ['CCC','DDD', 2,1],  // C:D
      ['AAA','CCC', 2,0],  // A:C
      ['BBB','DDD', 1,0],  // B:D
      ['AAA','DDD', 1,0],  // A:D
      ['BBB','CCC', 1,0],  // B:C
    ]);
    // A: W3 → 9pts; B: W2,L1 → 6pts; C: W1,L2 → 3pts; D: W0,L3 → 0pts
    const result = simulateGroup(group, makeRng(1), played);
    expect(result.map(s => s.team.code)).toEqual(['AAA','BBB','CCC','DDD']);
    expect(result[0].Pts).toBe(9);
    expect(result[3].Pts).toBe(0);
  });

  test('desempate Pts→GD: A y D empatan en Pts, A gana por GD', () => {
    // A:Pts=6,GD=+2 | D:Pts=6,GD=0 | B,C: 3pts each
    const [A, B, C, D] = ['AAA','BBB','CCC','DDD'].map(c => team(c));
    const group = { id: 'T', teams: [A, B, C, D] };
    const played = makePlayedResults([
      ['AAA','BBB', 2,0],  // A beats B 2-0
      ['CCC','DDD', 0,1],  // D beats C 0-1(gh=0,ga=1)
      ['AAA','CCC', 1,0],  // A beats C
      ['BBB','DDD', 1,0],  // B beats D
      ['AAA','DDD', 0,1],  // D beats A (ga=1)
      ['BBB','CCC', 0,1],  // C beats B (ga=1)
    ]);
    // A: beats B(2-0), beats C(1-0), loses to D(0-1) → W2,L1, GF=3,GA=1,GD=+2, Pts=6
    // D: beats C(C:D gh=0,ga=1→D away gets ga=1), beats A(A:D gh=0,ga=1→D away scores),
    //    loses to B(B:D gh=1,ga=0→D away, GA+1) → W2,L1, GF=2,GA=2,GD=0, Pts=6

    const result = simulateGroup(group, makeRng(1), played);
    expect(result[0].team.code).toBe('AAA'); // A: GD=+2
    expect(result[1].team.code).toBe('DDD'); // D: GD=0
  });

  test('desempate H2H: A y D globalmente igualados, A gana el H2H directo', () => {
    // Scenario calculado: A=D=6pts,GD+1,GF=3; B=C=3pts,GD-1,GF=2
    // H2H A vs D: A:D gh=1,ga=0 → A wins. H2H B vs C: B:C gh=1,ga=0 → B wins.
    const [A, B, C, D] = ['AAA','BBB','CCC','DDD'].map(c => team(c));
    const group = { id: 'H', teams: [A, B, C, D] };
    const played = makePlayedResults([
      ['AAA','BBB', 2,1],  // A beats B
      ['CCC','DDD', 1,2],  // D beats C (gh=1,ga=2 → C home, D away scores 2)
      ['AAA','CCC', 0,1],  // C beats A
      ['BBB','DDD', 0,1],  // D beats B
      ['AAA','DDD', 1,0],  // A beats D ← clave del H2H
      ['BBB','CCC', 1,0],  // B beats C ← clave del H2H
    ]);
    const result = simulateGroup(group, makeRng(1), played);
    expect(result.map(s => s.team.code)).toEqual(['AAA','DDD','BBB','CCC']);
  });

  test('empate triple en H2H (ciclo A>B>C>A) → orden determinista por seed', () => {
    // A beats B, B beats C, C beats A — todos 6pts,GD+1,GF=2. D=0pts.
    // H2H también completamente empatado → sorteo RNG.
    const [A, B, C, D] = ['AAA','BBB','CCC','DDD'].map(c => team(c));
    const group = { id: 'C', teams: [A, B, C, D] };
    const played = makePlayedResults([
      ['AAA','BBB', 1,0],  // A beats B
      ['CCC','DDD', 1,0],  // C beats D
      ['AAA','CCC', 0,1],  // C beats A
      ['BBB','DDD', 1,0],  // B beats D
      ['AAA','DDD', 1,0],  // A beats D
      ['BBB','CCC', 1,0],  // B beats C
    ]);

    const result1 = simulateGroup(group, makeRng(42), played);
    const result2 = simulateGroup(group, makeRng(42), played); // misma seed
    const result3 = simulateGroup(group, makeRng(99), played); // seed distinta

    // Determinismo: misma seed → mismo orden
    expect(result1.map(s => s.team.code)).toEqual(result2.map(s => s.team.code));

    // D siempre es 4º (0 puntos, claro último)
    expect(result1[3].team.code).toBe('DDD');
    expect(result3[3].team.code).toBe('DDD');

    // Los tres primeros son {A,B,C} en algún orden
    const top3 = new Set(result1.slice(0,3).map(s => s.team.code));
    expect(top3).toEqual(new Set(['AAA','BBB','CCC']));
  });

  test('todos los partidos con played → P=3 para cada equipo', () => {
    const [A, B, C, D] = ['P0','P1','P2','P3'].map(c => team(c));
    const group = { id: 'P', teams: [A, B, C, D] };
    const played = makePlayedResults([
      ['P0','P1',1,0],['P2','P3',1,0],['P0','P2',1,0],
      ['P1','P3',1,0],['P0','P3',1,0],['P1','P2',1,0],
    ]);
    const result = simulateGroup(group, makeRng(1), played);
    expect(result.every(s => s.P === 3)).toBe(true);
    expect(result.reduce((sum, s) => sum + s.Pts, 0)).toBe(18); // 6 partidos × 3pts
  });
});

// ═══════════════════════════════════════════════════════════════════
// MC-2: rankBestThirds
// ═══════════════════════════════════════════════════════════════════
describe('rankBestThirds', () => {
  // Helpers para mock
  const mockThird = (code, Pts, GD, GF = 0) => ({
    team: team(code), group: code[0],
    P:3, W:0, D:0, L:0, GF, GA: GF - GD, GD, Pts,
  });
  const wrapGroup = third => [null, null, third, null];

  test('devuelve exactamente 8 equipos de 12', () => {
    const groups = Array.from({ length: 12 }, (_, i) =>
      wrapGroup(mockThird(`T${i}`, i % 7, 0))
    );
    const result = rankBestThirds(groups, makeRng(1));
    expect(result).toHaveLength(8);
  });

  test('los 8 con Pts más altos clasifican (sin empates)', () => {
    // Pts = 9,8,7,6,5,4,3,2 → todos distintos, top-8 claros
    const pts = [9,8,7,6,5,4,3,2,1,0,0,0];
    const groups = pts.map((p, i) => wrapGroup(mockThird(`T${i}`, p, 0)));
    const result = rankBestThirds(groups, makeRng(1));
    const resultPts = result.map(s => s.Pts).sort((a,b) => b-a);
    expect(resultPts).toEqual([9,8,7,6,5,4,3,2]);
  });

  test('empate en Pts resuelto por GD', () => {
    // 9 terceros con Pts=5 y GD distintos; el de GD=-3 (el peor) no clasifica
    const gds = [5,4,3,2,1,0,-1,-2,-3];
    const extras = [mockThird('E0',4,0), mockThird('E1',4,0), mockThird('E2',4,0)];
    const thirds = gds.map((gd, i) => mockThird(`T${i}`, 5, gd));
    const groups = [...thirds, ...extras].map(wrapGroup);
    const result = rankBestThirds(groups, makeRng(1));
    const codes = result.map(s => s.team.code);
    // Los primeros 8 en ranking: T0..T7 (GD 5..−2), T8 (GD=−3) no clasifica
    expect(codes).not.toContain('T8');
    expect(codes).toContain('T0');
    expect(codes).toContain('T7');
  });

  test('determinista: misma seed → mismo orden cuando hay empates', () => {
    const groups = Array.from({ length: 12 }, (_, i) =>
      wrapGroup(mockThird(`E${i}`, 4, 0, i))  // mismo Pts y GD → GF como desempate
    );
    const r1 = rankBestThirds(groups, makeRng(77));
    const r2 = rankBestThirds(groups, makeRng(77));
    expect(r1.map(s => s.team.code)).toEqual(r2.map(s => s.team.code));
  });
});
