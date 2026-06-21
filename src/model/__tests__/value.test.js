import { describe, it, expect } from 'vitest';
import { evPercent, bestOdds, analyzeValue } from '../value.js';

const MATCH_WITH_BOOKS = {
  markets: [
    {
      key: '1x2',
      books: [
        { bookmaker: 'bet365',   outcomes: { home: 2.10, draw: 3.40, away: 3.60 } },
        { bookmaker: 'pinnacle', outcomes: { home: 2.20, draw: 3.30, away: 3.55 } },
        { bookmaker: 'william',  outcomes: { home: 2.05, draw: 3.50, away: 3.80 } },
      ],
    },
  ],
};

const FALLBACK = { home: 2.00, draw: 3.30, away: 3.70, source: 'modelo' };

describe('evPercent()', () => {
  it('EV positivo cuando modelo > prob implícita', () => {
    expect(evPercent(0.55, 2.10)).toBeGreaterThan(0);
  });
  it('EV exacto: p=0.55, cuota=2.0 → 10%', () => {
    // (0.55·2.0 − 1)·100 = 10
    expect(evPercent(0.55, 2.0)).toBeCloseTo(10, 2);
  });
  it('cuota inválida → 0', () => {
    expect(evPercent(0.5, 1.0)).toBe(0);
    expect(evPercent(0.5, null)).toBe(0);
  });
});

describe('bestOdds()', () => {
  it('encuentra la cuota más alta por resultado y la casa', () => {
    const b = bestOdds(MATCH_WITH_BOOKS);
    expect(b.home.odds).toBe(2.20);
    expect(b.home.book).toBe('pinnacle');
    expect(b.draw.odds).toBe(3.50);
    expect(b.draw.book).toBe('william');
    expect(b.away.odds).toBe(3.80);
    expect(b.away.book).toBe('william');
  });

  it('usa fallback cuando no hay markets', () => {
    const b = bestOdds({}, FALLBACK);
    expect(b.home.odds).toBe(2.00);
    expect(b.home.book).toBe('modelo');
  });

  it('devuelve null por resultado sin datos', () => {
    const b = bestOdds({});
    expect(b.home).toBeNull();
  });
});

describe('analyzeValue()', () => {
  it('detecta value cuando el modelo supera la prob justa', () => {
    // Modelo muy alto en home → debería haber value en home
    const model = { home: 0.60, draw: 0.20, away: 0.20 };
    const result = analyzeValue(model, MATCH_WITH_BOOKS);
    const homeOutcome = result.outcomes.find((o) => o.outcome === 'home');
    expect(homeOutcome.hasValue).toBe(true);
    expect(homeOutcome.ev).toBeGreaterThan(0);
    expect(homeOutcome.bestBook).toBe('pinnacle'); // mejor cuota home
  });

  it('bestValue es el outcome con mayor EV', () => {
    const model = { home: 0.65, draw: 0.18, away: 0.17 };
    const result = analyzeValue(model, MATCH_WITH_BOOKS);
    expect(result.bestValue).not.toBeNull();
    expect(result.bestValue.outcome).toBe('home');
  });

  it('no detecta value cuando el modelo coincide con el mercado', () => {
    // Modelo ≈ prob justa → sin edge significativo
    const model = { home: 0.33, draw: 0.33, away: 0.34 };
    const result = analyzeValue(model, MATCH_WITH_BOOKS);
    // El favorito del mercado (home) no debería tener value con modelo plano
    const homeOutcome = result.outcomes.find((o) => o.outcome === 'home');
    expect(homeOutcome.hasValue).toBe(false);
  });

  it('calcula el edge (modelo − prob justa)', () => {
    const model = { home: 0.60, draw: 0.20, away: 0.20 };
    const result = analyzeValue(model, MATCH_WITH_BOOKS);
    const homeOutcome = result.outcomes.find((o) => o.outcome === 'home');
    expect(homeOutcome.edge).toBeGreaterThan(0);
    expect(homeOutcome.fairProb).toBeLessThan(0.60);
  });

  it('explanation indica consenso multi-casa', () => {
    const model = { home: 0.50, draw: 0.25, away: 0.25 };
    const result = analyzeValue(model, MATCH_WITH_BOOKS);
    expect(result.explanation.bookCount).toBe(3);
    expect(result.explanation.fairSource).toContain('consenso');
  });

  it('funciona con fallback odds (sin markets)', () => {
    const model = { home: 0.55, draw: 0.25, away: 0.20 };
    const result = analyzeValue(model, {}, FALLBACK);
    expect(result.outcomes).toHaveLength(3);
    expect(result.outcomes[0].bestOdds).toBe(2.00);
  });

  it('sin modelo devuelve estructura vacía', () => {
    const result = analyzeValue(null, MATCH_WITH_BOOKS);
    expect(result.outcomes).toEqual([]);
    expect(result.bestValue).toBeNull();
  });
});
