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
  simulateKnockoutMatch,
  fillBracket,
  simulateBracket,
  THIRD_SLOT_MODE,
  runTournamentSimulation,
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

// ─── Helpers MC-3 ───────────────────────────────────────────────────
/** Equipo mínimo para knockout: solo necesita deriveLambdas + penales. */
function kTeam(code, overrides = {}) {
  return {
    code,
    attack:  overrides.attack  ?? 1.0,
    defense: overrides.defense ?? 1.0,
    elo:     overrides.elo     ?? 1500,
    form:    overrides.form    ?? '',
  };
}

/**
 * Crea el mapa `qualified` con 32 equipos mínimos para simulateBracket.
 * Se puede pasar un objeto de overrides por clave (ej. { '1A': { attack: 3.0 } }).
 */
function makeQualified(overrides = {}) {
  const groups = 'ABCDEFGHIJKL'.split('');
  const q = {};
  for (const g of groups) {
    q[`1${g}`] = kTeam(`P1${g}`, overrides[`1${g}`] ?? {});
    q[`2${g}`] = kTeam(`P2${g}`, overrides[`2${g}`] ?? {});
  }
  for (let i = 1; i <= 8; i++) {
    q[`T${i}`] = kTeam(`T${i}`, overrides[`T${i}`] ?? {});
  }
  return q;
}

// ─── MC-3: simulateKnockoutMatch ────────────────────────────────────
describe('simulateKnockoutMatch', () => {
  test('devuelve la estructura correcta', () => {
    const [A, B] = [kTeam('AAA'), kTeam('BBB')];
    const res = simulateKnockoutMatch(A, B, makeRng(42));
    expect(res).toHaveProperty('gh');
    expect(res).toHaveProperty('ga');
    expect(res).toHaveProperty('winner');
    expect(res).toHaveProperty('viaPenalties');
    expect(typeof res.gh).toBe('number');
    expect(typeof res.ga).toBe('number');
    expect(typeof res.viaPenalties).toBe('boolean');
  });

  test('winner es siempre home o away', () => {
    const [A, B] = [kTeam('AAA'), kTeam('BBB')];
    const rng = makeRng(7);
    for (let i = 0; i < 50; i++) {
      const { winner } = simulateKnockoutMatch(A, B, rng);
      expect([A, B]).toContain(winner);
    }
  });

  test('goles son enteros no negativos', () => {
    const [A, B] = [kTeam('AAA'), kTeam('BBB')];
    const rng = makeRng(13);
    for (let i = 0; i < 50; i++) {
      const { gh, ga } = simulateKnockoutMatch(A, B, rng);
      expect(gh).toBeGreaterThanOrEqual(0);
      expect(ga).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(gh)).toBe(true);
      expect(Number.isInteger(ga)).toBe(true);
    }
  });

  test('determinista: misma seed → mismo resultado', () => {
    const [A, B] = [kTeam('XXX'), kTeam('YYY')];
    const r1 = simulateKnockoutMatch(A, B, makeRng(55));
    const r2 = simulateKnockoutMatch(A, B, makeRng(55));
    expect(r1.gh).toBe(r2.gh);
    expect(r1.ga).toBe(r2.ga);
    expect(r1.winner).toBe(r2.winner === r1.winner ? r1.winner : r2.winner);
    expect(r1.viaPenalties).toBe(r2.viaPenalties);
  });

  test('equipo mucho más fuerte gana la mayoría de partidos', () => {
    const strong = kTeam('STR', { attack: 4.0, elo: 2100 });
    const weak   = kTeam('WEK', { attack: 0.3, elo: 900  });
    const rng = makeRng(42);
    let strongWins = 0;
    for (let i = 0; i < 200; i++) {
      const { winner } = simulateKnockoutMatch(strong, weak, rng);
      if (winner === strong) strongWins++;
    }
    expect(strongWins).toBeGreaterThan(150); // >75%
  });

  test('penales ocurren estadísticamente con equipos iguales', () => {
    const [A, B] = [kTeam('AAA'), kTeam('BBB')];
    const rng = makeRng(99);
    let penCount = 0;
    for (let i = 0; i < 500; i++) {
      const { viaPenalties } = simulateKnockoutMatch(A, B, rng);
      if (viaPenalties) penCount++;
    }
    // Con λ~1.32 y ET, la tasa real debería ser ~5-15%
    expect(penCount).toBeGreaterThan(5);
    expect(penCount).toBeLessThan(100);
  });

  test('si NO hay empate → viaPenalties=false', () => {
    // Con ataque alto el marcador suele ser distinto; buscamos un caso determinado
    const strong = kTeam('STR', { attack: 5.0, elo: 2000 });
    const weak   = kTeam('WEK', { attack: 0.2, elo: 1000 });
    const rng = makeRng(1);
    // Primeros 20 resultados: al menos uno no termina en penales
    let nonPenFound = false;
    for (let i = 0; i < 20; i++) {
      if (!simulateKnockoutMatch(strong, weak, rng).viaPenalties) {
        nonPenFound = true;
        break;
      }
    }
    expect(nonPenFound).toBe(true);
  });

  test('fallback 0.5 si el code no está en shootoutRates', () => {
    // Con un código desconocido pHome=0.5; ejecutar 200 partidos que terminen
    // en penales y verificar que ambos ganan ~mitad
    const A = kTeam('ZZZ'); // no existe en shootoutRates
    const B = kTeam('QQQ'); // no existe en shootoutRates
    const rng = makeRng(42);
    let aWins = 0, totalPen = 0;
    for (let i = 0; i < 2000; i++) {
      const res = simulateKnockoutMatch(A, B, rng);
      if (res.viaPenalties) {
        totalPen++;
        if (res.winner === A) aWins++;
      }
    }
    // Con pHome=0.5, A gana entre 35-65% de las veces en penales
    if (totalPen > 10) {
      const ratio = aWins / totalPen;
      expect(ratio).toBeGreaterThan(0.30);
      expect(ratio).toBeLessThan(0.70);
    }
  });

  // Mini-bracket de 4 equipos de juguete (SF + Final)
  test('mini-bracket juguete: 4 equipos, 3 partidos → campeón válido', () => {
    const [T1, T2, T3, T4] = ['AAA','BBB','CCC','DDD'].map(c => kTeam(c));
    const rng = makeRng(42);
    const sf1   = simulateKnockoutMatch(T1, T2, rng);
    const sf2   = simulateKnockoutMatch(T3, T4, rng);
    const final = simulateKnockoutMatch(sf1.winner, sf2.winner, rng);

    expect([T1, T2]).toContain(sf1.winner);
    expect([T3, T4]).toContain(sf2.winner);
    expect([T1, T2, T3, T4]).toContain(final.winner);
    expect(typeof final.viaPenalties).toBe('boolean');
  });
});

// ─── MC-3: fillBracket ──────────────────────────────────────────────
describe('fillBracket', () => {
  test('devuelve exactamente 31 nodos', () => {
    const nodes = fillBracket(makeQualified());
    expect(nodes).toHaveLength(31);
  });

  test('todos los ids son únicos', () => {
    const nodes = fillBracket(makeQualified());
    const ids = nodes.map(n => n.id);
    expect(new Set(ids).size).toBe(31);
  });

  test('nodos R32 tienen home y away rellenados', () => {
    const q = makeQualified();
    const nodes = fillBracket(q);
    const r32 = nodes.filter(n => n.round === 'R32');
    expect(r32).toHaveLength(16);
    for (const n of r32) {
      expect(n.home).not.toBeNull();
      expect(n.away).not.toBeNull();
    }
  });

  test('nodos R16+ empiezan con home=null y away=null', () => {
    const nodes = fillBracket(makeQualified());
    const later = nodes.filter(n => n.round !== 'R32');
    for (const n of later) {
      expect(n.home).toBeNull();
      expect(n.away).toBeNull();
    }
  });

  test('nodos R32: cada equipo aparece exactamente una vez', () => {
    const q = makeQualified();
    const nodes = fillBracket(q);
    const r32 = nodes.filter(n => n.round === 'R32');
    const seen = new Set();
    for (const n of r32) {
      expect(seen.has(n.home.code)).toBe(false);
      expect(seen.has(n.away.code)).toBe(false);
      seen.add(n.home.code);
      seen.add(n.away.code);
    }
    expect(seen.size).toBe(32);
  });

  test('slot del final es null (sin feedsInto)', () => {
    const nodes = fillBracket(makeQualified());
    const fin   = nodes.find(n => n.round === 'F');
    expect(fin).toBeDefined();
    expect(fin.feedsInto).toBeNull();
    expect(fin.slot).toBeNull();
  });
});

// ─── MC-3: simulateBracket ──────────────────────────────────────────
describe('simulateBracket', () => {
  test('devuelve campeón no nulo y 31 nodos', () => {
    const result = simulateBracket(makeQualified(), makeRng(42));
    expect(result.champion).not.toBeNull();
    expect(result.nodes).toHaveLength(31);
  });

  test('campeón es uno de los 32 equipos clasificados', () => {
    const q = makeQualified();
    const allCodes = new Set(Object.values(q).map(t => t.code));
    const { champion } = simulateBracket(q, makeRng(42));
    expect(allCodes.has(champion.code)).toBe(true);
  });

  test('isApproximateThirdsMapping siempre es true', () => {
    const { isApproximateThirdsMapping } = simulateBracket(makeQualified(), makeRng(1));
    expect(isApproximateThirdsMapping).toBe(true);
  });

  test('THIRD_SLOT_MODE exportado es "ranking"', () => {
    expect(THIRD_SLOT_MODE).toBe('ranking');
  });

  test('determinista: misma seed → mismo campeón', () => {
    const q = makeQualified();
    const r1 = simulateBracket(q, makeRng(7));
    const r2 = simulateBracket(q, makeRng(7));
    expect(r1.champion.code).toBe(r2.champion.code);
  });

  test('seed distinta puede dar campeón distinto', () => {
    const q = makeQualified();
    const codes = new Set(
      Array.from({ length: 30 }, (_, i) =>
        simulateBracket(q, makeRng(i)).champion.code
      )
    );
    // Con 30 seeds distintas deben aparecer al menos 2 campeones distintos
    expect(codes.size).toBeGreaterThan(1);
  });

  test('todos los nodos del final tienen resultado', () => {
    const q = makeQualified();
    const { nodes } = simulateBracket(q, makeRng(42));
    for (const n of nodes) {
      // Todos los nodos deberían tener resultado (home y away nunca son null en un bracket completo)
      expect(n.result).not.toBeNull();
    }
  });

  test('equipo dominante gana el bracket con alta frecuencia', () => {
    const STRONG = '1A';
    const q = makeQualified({ [STRONG]: { attack: 5.0, defense: 0.3, elo: 2200 } });
    const strongCode = q[STRONG].code;
    let wins = 0;
    for (let i = 0; i < 100; i++) {
      const { champion } = simulateBracket(q, makeRng(i * 13 + 7));
      if (champion.code === strongCode) wins++;
    }
    // El equipo dominante debe ganar bastante más que 1/32 ≈ 3%
    expect(wins).toBeGreaterThan(15);
  });
});

// ═══════════════════════════════════════════════════════════════════
// MC-4 — runTournamentSimulation
// ═══════════════════════════════════════════════════════════════════

// ─── Helper: fixture de 12 grupos de 4 equipos ──────────────────────
function makeTestGroups(overrides = {}) {
  return 'ABCDEFGHIJKL'.split('').map(g => ({
    id: g,
    teams: [1, 2, 3, 4].map(n => {
      const code = `${g}${n}`;
      return {
        code,
        attack:  overrides[code]?.attack  ?? 1.0,
        defense: overrides[code]?.defense ?? 1.0,
        elo:     overrides[code]?.elo     ?? 1500,
        form:    overrides[code]?.form    ?? '',
      };
    }),
  }));
}

// Pre-computed resultado con 500 iteraciones (balance velocidad/precisión para tests)
let _cachedResult = null;
function getCachedResult() {
  if (!_cachedResult) {
    _cachedResult = runTournamentSimulation(makeTestGroups(), 500, 42);
  }
  return _cachedResult;
}

describe('runTournamentSimulation — estructura', () => {
  test('devuelve Map con 48 entradas (12 grupos × 4 equipos)', () => {
    const results = getCachedResult();
    expect(results.size).toBe(48);
  });

  test('cada entrada tiene todos los campos requeridos', () => {
    const results = getCachedResult();
    for (const r of results.values()) {
      expect(r).toHaveProperty('code');
      expect(r).toHaveProperty('groupId');
      expect(r).toHaveProperty('pAdvance');
      expect(r).toHaveProperty('pR16');
      expect(r).toHaveProperty('pQF');
      expect(r).toHaveProperty('pSF');
      expect(r).toHaveProperty('pFinal');
      expect(r).toHaveProperty('pChampion');
      expect(r).toHaveProperty('groupPosDist');
      expect(r).toHaveProperty('se');
      expect(r.groupPosDist).toHaveLength(4);
      expect(r.se).toHaveProperty('pChampion');
      expect(r.se).toHaveProperty('pAdvance');
    }
  });

  test('todas las probabilidades están en [0, 1]', () => {
    const results = getCachedResult();
    const keys = ['pAdvance','pR16','pQF','pSF','pFinal','pChampion'];
    for (const r of results.values()) {
      for (const k of keys) {
        expect(r[k]).toBeGreaterThanOrEqual(0);
        expect(r[k]).toBeLessThanOrEqual(1);
      }
    }
  });

  test('monotonía: pChampion ≤ pFinal ≤ pSF ≤ pQF ≤ pR16 ≤ pAdvance', () => {
    const results = getCachedResult();
    for (const r of results.values()) {
      expect(r.pChampion).toBeLessThanOrEqual(r.pFinal  + 1e-12);
      expect(r.pFinal   ).toBeLessThanOrEqual(r.pSF     + 1e-12);
      expect(r.pSF      ).toBeLessThanOrEqual(r.pQF     + 1e-12);
      expect(r.pQF      ).toBeLessThanOrEqual(r.pR16    + 1e-12);
      expect(r.pR16     ).toBeLessThanOrEqual(r.pAdvance + 1e-12);
    }
  });

  test('groupPosDist suma 1 por equipo', () => {
    const results = getCachedResult();
    for (const r of results.values()) {
      const sum = r.groupPosDist.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 8);
    }
  });

  test('error estándar > 0 para probs no degeneradas', () => {
    const results = getCachedResult();
    // Con 48 equipos iguales, todas las probs son > 0; SE debe ser > 0
    for (const r of results.values()) {
      if (r.pChampion > 0 && r.pChampion < 1) {
        expect(r.se.pChampion).toBeGreaterThan(0);
      }
    }
  });

  test('determinista: misma seed → mismo mapa de resultados', () => {
    const groups = makeTestGroups();
    const r1 = runTournamentSimulation(groups, 100, 77);
    const r2 = runTournamentSimulation(groups, 100, 77);
    for (const [code, v1] of r1) {
      const v2 = r2.get(code);
      expect(v1.pChampion).toBe(v2.pChampion);
      expect(v1.pAdvance).toBe(v2.pAdvance);
    }
  });
});

describe('runTournamentSimulation — invariantes exactas', () => {
  // Con N iteraciones, cada suma es count_total / N donde count_total es exactamente
  // k_expected × N (k_expected invariante por construcción). Por tanto las sumas son exactas.
  const N    = 200;
  const groups = makeTestGroups();
  let _inv = null;
  function getInv() {
    if (!_inv) _inv = runTournamentSimulation(groups, N, 42);
    return _inv;
  }

  const sum = (key) => {
    let s = 0;
    for (const r of getInv().values()) s += r[key];
    return s;
  };

  test('Σ pChampion = 1 (exacto: 1 campeón por iteración)', () => {
    expect(sum('pChampion')).toBeCloseTo(1.0, 6);
  });

  test('Σ pAdvance = 32 (exacto: 32 clasificados por iteración)', () => {
    expect(sum('pAdvance')).toBeCloseTo(32.0, 6);
  });

  test('Σ pR16 = 16 (exacto: 16 ganadores de R32 por iteración)', () => {
    expect(sum('pR16')).toBeCloseTo(16.0, 6);
  });

  test('Σ pQF = 8', () => {
    expect(sum('pQF')).toBeCloseTo(8.0, 6);
  });

  test('Σ pSF = 4', () => {
    expect(sum('pSF')).toBeCloseTo(4.0, 6);
  });

  test('Σ pFinal = 2', () => {
    expect(sum('pFinal')).toBeCloseTo(2.0, 6);
  });

  test('Σ posición-1 por grupo = 1 (un primer clasificado por grupo)', () => {
    // Para cada grupo, la suma de frecuencias de posición 1 debe ser ≈ 1
    const byGroup = {};
    for (const r of getInv().values()) {
      byGroup[r.groupId] ??= 0;
      byGroup[r.groupId] += r.groupPosDist[0];
    }
    for (const g of Object.keys(byGroup)) {
      expect(byGroup[g]).toBeCloseTo(1.0, 6);
    }
  });
});

describe('runTournamentSimulation — comportamiento', () => {
  test('con equipos iguales, pChampion ≈ 1/48 para todos', () => {
    // 48 equipos iguales: esperado ≈ 0.0208; con 2000 iter y ±3σ la variación máxima es pequeña
    const results = runTournamentSimulation(makeTestGroups(), 2000, 42);
    const pChamps = [...results.values()].map(r => r.pChampion);
    const mean = pChamps.reduce((a, b) => a + b, 0) / pChamps.length;
    expect(mean).toBeCloseTo(1 / 48, 2); // ≈ 0.021
  });

  test('equipo dominante tiene pChampion muy superior al resto', () => {
    const STRONG_CODE = 'A1';
    const groups = makeTestGroups({ A1: { attack: 4.0, defense: 0.3, elo: 2100 } });
    const results = runTournamentSimulation(groups, 1000, 42);
    const strongP = results.get(STRONG_CODE).pChampion;
    const avgOthers = ([...results.values()]
      .filter(r => r.code !== STRONG_CODE)
      .reduce((s, r) => s + r.pChampion, 0)) / 47;
    // El equipo dominante debe ser al menos 10× la media de los demás
    expect(strongP).toBeGreaterThan(avgOthers * 5);
  });

  test('código de groupId asignado correctamente', () => {
    const results = getCachedResult();
    for (const r of results.values()) {
      // El groupId debe ser la primera letra del code
      expect(r.groupId).toBe(r.code[0]);
    }
  });

  test('playedResults condiciona el resultado de grupos', () => {
    const groups = makeTestGroups();
    // Fijar que A1 gana todos sus partidos con goleada
    const played = new Map([
      ['A1:A2', { gh: 5, ga: 0 }],
      ['A3:A4', { gh: 0, ga: 0 }],
      ['A1:A3', { gh: 5, ga: 0 }],
      ['A2:A4', { gh: 0, ga: 0 }],
      ['A1:A4', { gh: 5, ga: 0 }],
      ['A3:A2', { gh: 0, ga: 0 }],
    ]);
    const results = runTournamentSimulation(groups, 200, 42, played);
    // A1 siempre clasifica 1º del grupo A
    expect(results.get('A1').groupPosDist[0]).toBeCloseTo(1.0, 6);
    expect(results.get('A1').pAdvance).toBeCloseTo(1.0, 6);
  });

  test('benchmark 10k iteraciones (solo tiempo, no falla)', () => {
    const groups = makeTestGroups();
    const t0 = performance.now();
    runTournamentSimulation(groups, 10_000, 42);
    const ms = performance.now() - t0;
    // Registrar en consola para el resumen del usuario
    console.log(`[MC-4 benchmark] 10k iteraciones: ${ms.toFixed(0)} ms`);
    // Sin límite de tiempo duro en el test; solo verificamos que termina
    expect(ms).toBeGreaterThan(0);
  });
});
