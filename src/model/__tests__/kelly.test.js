import { describe, it, expect } from 'vitest';
import { kellyFraction, recommendedStake, DEFAULT_FRACTION, DEFAULT_CAP } from '../kelly.js';

describe('kellyFraction()', () => {
  it('caso conocido: p=0.6, cuota=2.0 → f* = 0.2', () => {
    // f* = (b·p − q)/b = (1·0.6 − 0.4)/1 = 0.2
    expect(kellyFraction(0.6, 2.0)).toBeCloseTo(0.2, 5);
  });

  it('caso sin valor: p=0.5, cuota=1.8 → f* negativo', () => {
    // (0.8·0.5 − 0.5)/0.8 = (0.4−0.5)/0.8 = −0.125
    expect(kellyFraction(0.5, 1.8)).toBeCloseTo(-0.125, 5);
  });

  it('cuota = 1.0 (sin ganancia) → 0', () => {
    expect(kellyFraction(0.6, 1.0)).toBe(0);
  });

  it('apuesta segura p=1.0 → f* = 1.0 (todo el bankroll)', () => {
    expect(kellyFraction(1.0, 2.0)).toBeCloseTo(1.0, 5);
  });
});

describe('recommendedStake()', () => {
  it('aplica ¼ Kelly por defecto', () => {
    // f*=0.2, ¼ → 0.05 → 5%
    const r = recommendedStake(0.6, 2.0);
    expect(r.stakePct).toBeCloseTo(5.0, 1);
    expect(r.fraction).toBe(DEFAULT_FRACTION);
  });

  it('respeta el tope del 8%', () => {
    // p alta + cuota alta → f* grande; ¼ Kelly podría superar 8%
    const r = recommendedStake(0.9, 3.0);
    expect(r.stakePct).toBeLessThanOrEqual(8.0);
    expect(r.capped).toBe(true);
  });

  it('sin valor → stakePct 0 y hasValue false', () => {
    const r = recommendedStake(0.4, 1.8);
    expect(r.stakePct).toBe(0);
    expect(r.hasValue).toBe(false);
    expect(r.tone).toBe('muted');
  });

  it('calcula stakeAmount cuando se pasa bankroll', () => {
    // f*=0.2 → ¼ → 0.05 → 5% de 1000 = 50
    const r = recommendedStake(0.6, 2.0, { bankroll: 1000 });
    expect(r.stakeAmount).toBeCloseTo(50, 1);
  });

  it('stakeAmount es null sin bankroll', () => {
    const r = recommendedStake(0.6, 2.0);
    expect(r.stakeAmount).toBeNull();
  });

  it('permite fraction y cap personalizados', () => {
    // ½ Kelly: f*=0.2 → 0.1 → 10%, pero cap configurado a 0.15 → 10%
    const r = recommendedStake(0.6, 2.0, { fraction: 0.5, cap: 0.15 });
    expect(r.stakePct).toBeCloseTo(10.0, 1);
  });

  it('clasificación de tono: conservador para stake bajo', () => {
    // p=0.53, cuota=2.0 → f*=0.06, ¼ → 0.015 → 1.5% → conservador
    const r = recommendedStake(0.53, 2.0);
    expect(r.stakePct).toBeCloseTo(1.5, 1);
    expect(r.tone).toBe('emerald');
    expect(r.label).toBe('Conservador');
  });

  it('clasificación de tono: moderado para stake medio', () => {
    // p=0.55, cuota=2.0 → f*=0.10, ¼ → 0.025 → 2.5% → moderado
    const r = recommendedStake(0.55, 2.0);
    expect(r.tone).toBe('violet');
    expect(r.label).toBe('Moderado');
  });

  it('explanation contiene la fórmula y los componentes', () => {
    const r = recommendedStake(0.6, 2.0, { bankroll: 500 });
    expect(r.explanation.formula).toContain('f*');
    expect(r.explanation.b).toBeCloseTo(1.0, 4);
    expect(r.explanation.p).toBeCloseTo(0.6, 4);
    expect(r.explanation.bankroll).toBe(500);
  });

  it('DEFAULT_CAP es 0.08', () => {
    expect(DEFAULT_CAP).toBe(0.08);
  });
});
