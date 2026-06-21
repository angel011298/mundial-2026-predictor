import { describe, it, expect } from 'vitest';
import { buildParlay, detectCorrelations } from '../parlay.js';

const LEG_A = { matchId: 'm1', outcome: 'home', label: 'Argentina gana', prob: 0.60, odds: 1.80 };
const LEG_B = { matchId: 'm2', outcome: 'home', label: 'Francia gana',   prob: 0.55, odds: 1.90 };
const LEG_C = { matchId: 'm3', outcome: 'away', label: 'Brasil gana',    prob: 0.50, odds: 2.10 };

describe('detectCorrelations()', () => {
  it('detecta dos patas del mismo partido', () => {
    const legs = [
      { matchId: 'm1', outcome: 'home' },
      { matchId: 'm1', outcome: 'over' },
      { matchId: 'm2', outcome: 'home' },
    ];
    const groups = detectCorrelations(legs);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toEqual([0, 1]);
  });

  it('sin correlaciones devuelve array vacío', () => {
    const groups = detectCorrelations([LEG_A, LEG_B, LEG_C]);
    expect(groups).toEqual([]);
  });
});

describe('buildParlay()', () => {
  it('prob combinada = producto de probabilidades', () => {
    const p = buildParlay([LEG_A, LEG_B]);
    expect(p.combinedProb).toBeCloseTo(0.60 * 0.55, 4); // 0.33
  });

  it('cuota combinada = producto de cuotas', () => {
    const p = buildParlay([LEG_A, LEG_B]);
    expect(p.combinedOdds).toBeCloseTo(1.80 * 1.90, 2); // 3.42
  });

  it('EV combinado correcto', () => {
    const p = buildParlay([LEG_A, LEG_B]);
    // EV = 0.33 × 3.42 − 1 = 0.1286 → 12.86%
    const expectedEV = (0.60 * 0.55 * 1.80 * 1.90 - 1) * 100;
    expect(p.ev).toBeCloseTo(expectedEV, 1);
  });

  it('payout exacto desde el stake', () => {
    const p = buildParlay([LEG_A, LEG_B], { stake: 100 });
    // payout = 100 × 3.42 = 342
    expect(p.payout).toBeCloseTo(342, 1);
    expect(p.profit).toBeCloseTo(242, 1);
  });

  it('tres patas independientes con EV+ → recomendación ok', () => {
    const p = buildParlay([LEG_A, LEG_B, LEG_C]);
    expect(p.correlated).toBe(false);
    expect(['ok', 'caution']).toContain(p.recommendation.level);
  });

  it('marca patas correlacionadas y desaconseja', () => {
    const correlated = [
      { matchId: 'm1', outcome: 'home', label: 'Local gana', prob: 0.6, odds: 1.8 },
      { matchId: 'm1', outcome: 'over', label: 'Over 2.5',   prob: 0.55, odds: 1.9 },
    ];
    const p = buildParlay(correlated);
    expect(p.correlated).toBe(true);
    expect(p.recommendation.level).toBe('avoid');
    expect(p.recommendation.tone).toBe('rose');
  });

  it('EV negativo → recomendación avoid', () => {
    const badLegs = [
      { matchId: 'm1', outcome: 'home', label: 'A', prob: 0.40, odds: 1.50 },
      { matchId: 'm2', outcome: 'home', label: 'B', prob: 0.40, odds: 1.50 },
    ];
    const p = buildParlay(badLegs);
    expect(p.ev).toBeLessThan(0);
    expect(p.recommendation.level).toBe('avoid');
  });

  it('4+ patas con EV+ → caution por varianza alta', () => {
    const legs = [
      { matchId: 'm1', outcome: 'home', label: 'A', prob: 0.70, odds: 1.70 },
      { matchId: 'm2', outcome: 'home', label: 'B', prob: 0.70, odds: 1.70 },
      { matchId: 'm3', outcome: 'home', label: 'C', prob: 0.70, odds: 1.70 },
      { matchId: 'm4', outcome: 'home', label: 'D', prob: 0.70, odds: 1.70 },
    ];
    const p = buildParlay(legs);
    expect(p.recommendation.level).toBe('caution');
  });

  it('patas vacías → estructura neutra', () => {
    const p = buildParlay([]);
    expect(p.combinedProb).toBe(0);
    expect(p.recommendation.level).toBe('none');
  });

  it('filtra patas inválidas (cuota ≤ 1 o prob fuera de rango)', () => {
    const legs = [LEG_A, { matchId: 'm9', outcome: 'home', prob: 0.5, odds: 0.9 }];
    const p = buildParlay(legs);
    expect(p.legs).toHaveLength(1);
  });

  it('explanation incluye fórmulas y nota de varianza', () => {
    const p = buildParlay([LEG_A, LEG_B], { stake: 50 });
    expect(p.explanation.formulaProb).toContain('∏');
    expect(p.explanation.varianceNote).toBeTruthy();
    expect(p.explanation.legCount).toBe(2);
  });
});
