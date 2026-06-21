import { describe, it, expect } from 'vitest';
import { eloProbability, MAX_DRAW_RATE } from '../elo.js';

describe('eloProbability()', () => {
  it('probabilidades suman ≈ 1', () => {
    const r = eloProbability('ARG', 2076, 1800);
    expect(r.home + r.draw + r.away).toBeCloseTo(1, 5);
  });

  it('equipos con Elo igual → home ≈ away', () => {
    const r = eloProbability('T1', 1800, 1800);
    expect(Math.abs(r.home - r.away)).toBeLessThan(0.005);
  });

  it('equipos con Elo igual → draw ≈ MAX_DRAW_RATE', () => {
    const r = eloProbability('T1', 1800, 1800);
    expect(r.draw).toBeCloseTo(MAX_DRAW_RATE, 2);
  });

  it('diferencia Elo 200 → equipo más fuerte con > 55% victoria', () => {
    const r = eloProbability('ARG', 2000, 1800);
    expect(r.home).toBeGreaterThan(0.55);
  });

  it('diferencia Elo 400 → equipo más fuerte con > 70% victoria', () => {
    const r = eloProbability('ARG', 2200, 1800);
    expect(r.home).toBeGreaterThan(0.70);
  });

  it('host (MEX) recibe ventaja → más probabilidad de victoria que sin ventaja', () => {
    const withAdv    = eloProbability('MEX', 1835, 1835);
    const withoutAdv = eloProbability('T1',  1835, 1835);
    expect(withAdv.home).toBeGreaterThan(withoutAdv.home);
  });

  it('probabilidades nunca negativas (Elo extremo)', () => {
    const r = eloProbability('ARG', 2500, 1200);
    expect(r.home).toBeGreaterThanOrEqual(0);
    expect(r.draw).toBeGreaterThanOrEqual(0);
    expect(r.away).toBeGreaterThanOrEqual(0);
  });

  it('sin datos Elo devuelve probabilidades válidas (fallback neutro)', () => {
    const r = eloProbability('T1', null, null);
    expect(r.home + r.draw + r.away).toBeCloseTo(1, 5);
    expect(r.home).toBeGreaterThan(0);
  });

  it('draw decrece al aumentar la diferencia de Elo', () => {
    const close = eloProbability('ARG', 1900, 1850);  // diff 50
    const far   = eloProbability('ARG', 2200, 1700);  // diff 500
    expect(close.draw).toBeGreaterThan(far.draw);
  });

  it('asimetría correcta: mayor Elo siempre gana más', () => {
    const r = eloProbability('BRA', 1948, 1600);
    expect(r.home).toBeGreaterThan(r.away);
  });
});
