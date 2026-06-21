import { describe, it, expect } from 'vitest';
import { dixonColesProbs, poisson, formMultiplier, LEAGUE_AVG } from '../dixonColes.js';

describe('poisson()', () => {
  it('P(0|1) ≈ 0.368 (e^-1)', () => {
    expect(poisson(1, 0)).toBeCloseTo(Math.exp(-1), 4);
  });
  it('P(1|1) ≈ 0.368', () => {
    expect(poisson(1, 1)).toBeCloseTo(Math.exp(-1), 4);
  });
  it('P(X|0) = 0 para lambda=0', () => {
    expect(poisson(0, 2)).toBe(0);
  });
});

describe('formMultiplier()', () => {
  it('sin forma devuelve 1.0', () => {
    expect(formMultiplier('')).toBe(1.0);
  });
  it('5 victorias → multiplicador > 1', () => {
    expect(formMultiplier('WWWWW')).toBeGreaterThan(1.0);
  });
  it('5 derrotas → multiplicador < 1', () => {
    expect(formMultiplier('LLLLL')).toBeLessThan(1.0);
  });
  it('rango acotado entre 0.82 y 1.18', () => {
    const m = formMultiplier('WWWWW');
    expect(m).toBeLessThanOrEqual(1.18);
    expect(m).toBeGreaterThanOrEqual(0.82);
  });
});

describe('dixonColesProbs()', () => {
  const argentina = { code: 'ARG', avgGF: 2.4, avgGA: 0.6, form: 'WWWWW', eloRating: 2076 };
  const comoros   = { code: 'COM', avgGF: 0.8, avgGA: 2.2, form: 'LLLLL', eloRating: 1350 };
  const equalA    = { code: 'T1',  avgGF: LEAGUE_AVG, avgGA: LEAGUE_AVG, form: 'WDLWL' };
  const equalB    = { code: 'T2',  avgGF: LEAGUE_AVG, avgGA: LEAGUE_AVG, form: 'WDLWL' };

  it('probabilidades suman ≈ 1', () => {
    const r = dixonColesProbs(argentina, comoros);
    expect(r.home + r.draw + r.away).toBeCloseTo(1, 4);
  });

  it('equipo claramente superior gana > 70%', () => {
    const r = dixonColesProbs(argentina, comoros);
    expect(r.home).toBeGreaterThan(0.70);
  });

  it('equipos iguales tienen home ≈ away (diferencia < 5%)', () => {
    const r = dixonColesProbs(equalA, equalB);
    expect(Math.abs(r.home - r.away)).toBeLessThan(0.05);
  });

  it('ou25.over + ou25.under ≈ 1', () => {
    const r = dixonColesProbs(argentina, comoros);
    expect(r.ou25.over + r.ou25.under).toBeCloseTo(1, 4);
  });

  it('btts.yes + btts.no ≈ 1', () => {
    const r = dixonColesProbs(argentina, comoros);
    expect(r.btts.yes + r.btts.no).toBeCloseTo(1, 4);
  });

  it('topScore tiene formato "N-N"', () => {
    const r = dixonColesProbs(argentina, comoros);
    expect(r.topScore).toMatch(/^\d+-\d+$/);
  });

  it('Argentina vs Comoros: over 2.5 muy probable (> 60%)', () => {
    const r = dixonColesProbs(argentina, comoros);
    expect(r.ou25.over).toBeGreaterThan(0.60);
  });

  it('degrada graciosamente con datos mínimos (sin avgGF/avgGA)', () => {
    const r = dixonColesProbs({}, {});
    expect(r.home + r.draw + r.away).toBeCloseTo(1, 3);
  });

  it('selección sede (MEX) recibe ventaja Elo positiva → más victorias locales', () => {
    const mexico  = { code: 'MEX', avgGF: 1.5, avgGA: 1.0, form: 'WDWDW' };
    const ecuador = { code: 'ECU', avgGF: 1.5, avgGA: 1.0, form: 'WDWDW' };
    const withHost    = dixonColesProbs(mexico, ecuador);
    const withoutHost = dixonColesProbs(ecuador, mexico); // invertido
    expect(withHost.home).toBeGreaterThan(withoutHost.away);
  });
});
