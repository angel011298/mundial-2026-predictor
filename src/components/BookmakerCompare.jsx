import { useState } from 'react';
import { ChevronDown, Star, ExternalLink } from 'lucide-react';
import { toneClasses } from '../utils/format.js';

// ─── Helpers de display ───────────────────────────────────────────

const MARKET_LABELS = {
  '1x2':  '1X2 · Resultado',
  'dc':   'Doble Oportunidad',
  'btts': 'Ambos Marcan',
  'dnb':  'Draw No Bet',
};

function marketLabel(key) {
  if (MARKET_LABELS[key]) return MARKET_LABELS[key];
  if (key.startsWith('ou@')) return `Over/Under ${key.split('@')[1]}`;
  if (key.startsWith('ah@')) return `Hándicap Asiático ${key.split('@')[1]}`;
  return key.toUpperCase();
}

function outcomeLabel(marketKey, k, home, away) {
  if (marketKey === '1x2')  return { home: home?.name ?? 'Local', draw: 'Empate', away: away?.name ?? 'Visita' }[k] ?? k;
  if (marketKey === 'btts') return { yes: 'Ambos sí', no: 'No marcan' }[k] ?? k;
  if (marketKey === 'dc')   return { '1x': '1X', '12': '12', 'x2': 'X2' }[k] ?? k;
  if (marketKey.startsWith('ou@')) {
    const line = marketKey.split('@')[1];
    return { over: `+${line}`, under: `-${line}` }[k] ?? k;
  }
  return k;
}

/**
 * Dado un mercado (books[]), devuelve un mapa: outcome → best { odds, book }
 */
function findBests(books) {
  const bests = {};
  for (const bk of books) {
    for (const [k, price] of Object.entries(bk.outcomes ?? {})) {
      if (price > 1 && (!bests[k] || price > bests[k].odds)) {
        bests[k] = { odds: price, book: bk.bookmaker };
      }
    }
  }
  return bests;
}

/** Obtiene todos los bookmakers únicos de un mercado */
function allBooks(books) {
  return [...new Set(books.map((b) => b.bookmaker))];
}

/** Todos los outcomes únicos del mercado */
function allOutcomes(books) {
  const keys = new Set();
  for (const bk of books) Object.keys(bk.outcomes ?? {}).forEach((k) => keys.add(k));
  return [...keys];
}

// ─── Sub-componentes ──────────────────────────────────────────────

function OddsCell({ price, isBest }) {
  if (price == null || price <= 1) return <td className="px-2 py-1.5 text-center text-[11px] text-zinc-700">—</td>;
  return (
    <td className={`px-2 py-1.5 text-center text-[11px] tabular-nums font-bold transition-colors ${
      isBest ? 'text-emerald-300 bg-emerald-500/10' : 'text-zinc-300'
    }`}>
      {price.toFixed(2)}
      {isBest && <span className="ml-0.5 text-emerald-500">▲</span>}
    </td>
  );
}

function MarketTable({ market, home, away }) {
  const { books } = market;
  if (!books?.length) return null;

  const bookmakers  = allBooks(books);
  const outcomes    = allOutcomes(books);
  const bests       = findBests(books);

  // Índice: bookmaker → outcomes map
  const bookIndex = Object.fromEntries(
    books.map((b) => [b.bookmaker, b.outcomes ?? {}])
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full min-w-max">
        <thead>
          <tr className="border-b border-zinc-800/80">
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Casa
            </th>
            {outcomes.map((k) => (
              <th key={k} className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                {outcomeLabel(market.key, k, home, away)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bookmakers.map((bk, i) => (
            <tr key={bk} className={i % 2 === 0 ? '' : 'bg-zinc-900/30'}>
              <td className="px-2 py-1.5 text-[11px] text-zinc-400 whitespace-nowrap">{bk}</td>
              {outcomes.map((k) => (
                <OddsCell
                  key={k}
                  price={bookIndex[bk]?.[k]}
                  isBest={bests[k]?.book === bk && bests[k]?.odds === bookIndex[bk]?.[k]}
                />
              ))}
            </tr>
          ))}
        </tbody>
        {/* Fila de mejores cuotas */}
        <tfoot>
          <tr className="border-t border-zinc-800/80 bg-emerald-950/20">
            <td className="px-2 py-1.5 text-[10px] font-bold text-emerald-500 flex items-center gap-1">
              <Star size={9} /> Mejor
            </td>
            {outcomes.map((k) => (
              <td key={k} className="px-2 py-1.5 text-center text-[11px] font-black tabular-nums text-emerald-300">
                {bests[k] ? bests[k].odds.toFixed(2) : '—'}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────

/**
 * Tabla comparadora de cuotas por bookmaker y mercado.
 * Recibe un partido con markets[] (esquema extendido de dataFusion).
 */
export default function BookmakerCompare({ match }) {
  const [openMarkets, setOpenMarkets] = useState({ '1x2': true });

  const markets = match?.markets?.filter((m) => m.books?.length > 0) ?? [];

  if (!markets.length) {
    return (
      <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
        <p className="text-center text-[11px] text-zinc-600">
          Sin cuotas de casas de apuestas. Configura las claves API para verlas aquí.
        </p>
      </div>
    );
  }

  const toggle = (key) =>
    setOpenMarkets((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <ExternalLink size={11} className="text-zinc-600" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Comparador de cuotas · {markets.reduce((n, m) => n + (m.books?.length ?? 0), 0)} casas
        </span>
      </div>

      {markets.map((mkt) => (
        <div key={mkt.key} className="rounded-xl border border-zinc-800 overflow-hidden">
          {/* Header del mercado */}
          <button
            onClick={() => toggle(mkt.key)}
            className="flex w-full items-center justify-between px-3 py-2 hover:bg-zinc-900/40 transition-colors"
          >
            <span className="text-[11px] font-semibold text-zinc-300">{marketLabel(mkt.key)}</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-600">{mkt.books?.length} casas</span>
              <ChevronDown
                size={13}
                className={`text-zinc-600 transition-transform ${openMarkets[mkt.key] ? 'rotate-180' : ''}`}
              />
            </div>
          </button>

          {openMarkets[mkt.key] && (
            <div className="px-2 pb-2 animate-fade-up">
              <MarketTable market={mkt} home={match.home} away={match.away} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
