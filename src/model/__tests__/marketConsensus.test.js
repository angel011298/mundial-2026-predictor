import { describe, it, expect } from 'vitest';
import { devig, consensusProbs, extractMarket1x2, getMarketProbs } from '../marketConsensus.js';

const TYPICAL_BOOK = { home: 2.10, draw: 3.40, away: 3.60 };
const BALANCED     = { home: 3.00, draw: 3.00, draw2: 3.00 }; // para devig
const BALANCED_OK  = { home: 3.00, draw: 3.30, away: 3.00 };  // ligeramente sesgado

describe('devig()', () => {
  it('probabilidades suman exactamente 1', () => {
    const r = devig(TYPICAL_BOOK);
    expect(r.home + r.draw + r.away).toBeCloseTo(1, 5);
  });

  it('overround > 1 con cuotas reales (la casa tiene margen)', () => {
    expect(devig(TYPICAL_BOOK).overround).toBeGreaterThan(1);
  });

  it('favorite tiene mayor probabilidad que underdog', () => {
    const r = devig(TYPICAL_BOOK);
    expect(r.home).toBeGreaterThan(r.away);
  });

  it('odds nulas → distribución uniforme', () => {
    const r = devig(null);
    expect(r.home).toBeCloseTo(1 / 3, 4);
  });

  it('odds inválidas (< 1) → distribución uniforme', () => {
    const r = devig({ home: 0.5, draw: 3.40, away: 3.60 });
    expect(r.home).toBeCloseTo(1 / 3, 4);
  });

  it('overround justo (3 cuotas de 3.00) ≈ 1.0', () => {
    const r = devig({ home: 3.0, draw: 3.0, away: 3.0 });
    expect(r.overround).toBeCloseTo(1.0, 3);
    expect(r.home).toBeCloseTo(1 / 3, 4);
  });
});

describe('consensusProbs()', () => {
  const books = [
    { home: 2.00, draw: 3.40, away: 3.80 },
    { home: 2.05, draw: 3.30, away: 3.70 },
    { home: 2.10, draw: 3.20, away: 3.60 },
  ];

  it('null si lista vacía', () => {
    expect(consensusProbs([])).toBeNull();
    expect(consensusProbs(null)).toBeNull();
  });

  it('probabilidades suman ≈ 1 con lista válida', () => {
    const r = consensusProbs(books);
    expect(r.home + r.draw + r.away).toBeCloseTo(1, 4);
  });

  it('bookCount coincide con la lista', () => {
    expect(consensusProbs(books).bookCount).toBe(3);
  });

  it('filtra cuotas inválidas', () => {
    const mixed = [...books, { home: 0, draw: 3.3, away: 3.6 }];
    const r = consensusProbs(mixed);
    expect(r.bookCount).toBe(3); // la inválida fue filtrada
  });

  it('probabilidades nunca negativas', () => {
    const r = consensusProbs(books);
    expect(r.home).toBeGreaterThan(0);
    expect(r.draw).toBeGreaterThan(0);
    expect(r.away).toBeGreaterThan(0);
  });
});

describe('extractMarket1x2()', () => {
  it('devuelve array vacío si no hay markets', () => {
    expect(extractMarket1x2({})).toEqual([]);
    expect(extractMarket1x2(null)).toEqual([]);
  });

  it('extrae correctamente los outcomes del mercado 1x2', () => {
    const match = {
      markets: [
        {
          key: '1x2',
          books: [
            { bookmaker: 'bet365', outcomes: { home: 2.10, draw: 3.40, away: 3.60 } },
            { bookmaker: 'pinnacle', outcomes: { home: 2.08, draw: 3.45, away: 3.55 } },
          ],
        },
      ],
    };
    const result = extractMarket1x2(match);
    expect(result).toHaveLength(2);
    expect(result[0].home).toBe(2.10);
  });
});

describe('getMarketProbs()', () => {
  it('usa markets[] si hay al menos 2 libros', () => {
    const match = {
      markets: [
        {
          key: '1x2',
          books: [
            { bookmaker: 'b1', outcomes: { home: 2.10, draw: 3.40, away: 3.60 } },
            { bookmaker: 'b2', outcomes: { home: 2.05, draw: 3.50, away: 3.55 } },
          ],
        },
      ],
    };
    const r = getMarketProbs(match, null);
    expect(r).not.toBeNull();
    expect(r.home + r.draw + r.away).toBeCloseTo(1, 4);
  });

  it('cae a fallbackOdds si no hay markets', () => {
    const r = getMarketProbs({}, { home: 2.10, draw: 3.40, away: 3.60 });
    expect(r).not.toBeNull();
  });

  it('devuelve null sin datos', () => {
    const r = getMarketProbs({}, null);
    expect(r).toBeNull();
  });
});
