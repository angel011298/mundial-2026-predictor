import { describe, it, expect } from 'vitest';
import { blendProbabilities, DEFAULT_WEIGHTS, expectedValue, detectValueBets } from '../blend.js';

const DC_SIGNAL  = { home: 0.55, draw: 0.22, away: 0.23 };
const ELO_SIGNAL = { home: 0.60, draw: 0.20, away: 0.20 };
const MKT_SIGNAL = { home: 0.50, draw: 0.25, away: 0.25 };

describe('DEFAULT_WEIGHTS', () => {
  it('los pesos suman ≈ 1', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});

describe('blendProbabilities()', () => {
  it('probabilidades suman ≈ 1 con las tres señales', () => {
    const r = blendProbabilities({ dixonColes: DC_SIGNAL, elo: ELO_SIGNAL, market: MKT_SIGNAL });
    expect(r.home + r.draw + r.away).toBeCloseTo(1, 5);
  });

  it('result.home > 0.5 cuando todas las señales favorecen al local', () => {
    const r = blendProbabilities({ dixonColes: DC_SIGNAL, elo: ELO_SIGNAL, market: MKT_SIGNAL });
    expect(r.home).toBeGreaterThan(0.5);
  });

  it('con solo una señal devuelve esa señal normalizada', () => {
    const r = blendProbabilities({ market: MKT_SIGNAL });
    expect(r.home).toBeCloseTo(MKT_SIGNAL.home, 4);
    expect(r.draw).toBeCloseTo(MKT_SIGNAL.draw, 4);
    expect(r.away).toBeCloseTo(MKT_SIGNAL.away, 4);
  });

  it('sin señales → distribución uniforme', () => {
    const r = blendProbabilities({});
    expect(r.home).toBeCloseTo(1 / 3, 4);
  });

  it('señal null es ignorada (redistribuye pesos)', () => {
    // Usar DC extrema para que su ausencia sea perceptible
    const DC_EXTREME = { home: 0.85, draw: 0.08, away: 0.07 };
    const withDC    = blendProbabilities({ dixonColes: DC_EXTREME, elo: ELO_SIGNAL, market: MKT_SIGNAL });
    const withoutDC = blendProbabilities({ elo: ELO_SIGNAL, market: MKT_SIGNAL });
    // Sin DC (peso 0.40), el resultado debe ser notablemente diferente (> 5%)
    expect(Math.abs(withDC.home - withoutDC.home)).toBeGreaterThan(0.05);
  });

  it('explanation incluye contributions para cada señal disponible', () => {
    const r = blendProbabilities({ dixonColes: DC_SIGNAL, market: MKT_SIGNAL });
    expect(r.explanation.contributions).toHaveProperty('dixonColes');
    expect(r.explanation.contributions).toHaveProperty('market');
    expect(r.explanation.contributions).not.toHaveProperty('elo');
  });

  it('explanation.weights re-normalizan a suma 1 cuando hay señales ausentes', () => {
    const r = blendProbabilities({ elo: ELO_SIGNAL, market: MKT_SIGNAL });
    const wSum = Object.values(r.explanation.weights).reduce((s, w) => s + w, 0);
    expect(wSum).toBeCloseTo(1, 4);
  });

  it('pesos personalizados son respetados', () => {
    const customWeights = { dixonColes: 0.0, elo: 0.0, market: 1.0 };
    const r = blendProbabilities({ dixonColes: DC_SIGNAL, elo: ELO_SIGNAL, market: MKT_SIGNAL }, customWeights);
    // Con peso 1 en mercado, el resultado debe ser exactamente el mercado
    expect(r.home).toBeCloseTo(MKT_SIGNAL.home, 4);
  });

  it('señales desbalanceadas: una muy sesgada no domina con su peso configurado', () => {
    // ELO con 100% home debería pesar solo 0.25 en el blend
    const extreme = { home: 1.0, draw: 0.0, away: 0.0 };
    const r = blendProbabilities({ dixonColes: DC_SIGNAL, elo: extreme, market: MKT_SIGNAL });
    // El resultado no debe ser 1.0 → las otras señales compensan
    expect(r.home).toBeLessThan(0.80);
  });
});

describe('expectedValue()', () => {
  it('EV positivo cuando el modelo asigna más prob que la cuota implícita', () => {
    // Cuota 2.10 → prob implícita 47.6%; modelo dice 55% → hay valor
    expect(expectedValue(0.55, 2.10)).toBeGreaterThan(0);
  });

  it('EV negativo cuando el modelo está por debajo de la cuota', () => {
    expect(expectedValue(0.40, 2.10)).toBeLessThan(0);
  });

  it('EV ≈ 0 cuando modelo = cuota implícita', () => {
    const odds = 2.10;
    const p    = 1 / odds; // prob justa sin margen
    expect(Math.abs(expectedValue(p, odds))).toBeLessThan(0.5);
  });

  it('cuota inválida devuelve 0', () => {
    expect(expectedValue(0.5, 0)).toBe(0);
    expect(expectedValue(0.5, null)).toBe(0);
  });
});

describe('detectValueBets()', () => {
  it('detecta value bets con EV positivo', () => {
    const model = { home: 0.60, draw: 0.20, away: 0.20 };
    const odds  = { home: 2.10, draw: 3.50, away: 4.00 };
    const vb = detectValueBets(model, odds);
    expect(vb.length).toBeGreaterThan(0);
    expect(vb.every((b) => b.ev > 0)).toBe(true);
  });

  it('no detecta value cuando el modelo tiene menos probabilidad que la cuota', () => {
    const model = { home: 0.30, draw: 0.30, away: 0.40 };
    const odds  = { home: 1.50, draw: 3.50, away: 4.00 };
    const vb = detectValueBets(model, odds);
    expect(vb.some((b) => b.outcome === 'home')).toBe(false);
  });

  it('null inputs → array vacío', () => {
    expect(detectValueBets(null, null)).toEqual([]);
  });
});
