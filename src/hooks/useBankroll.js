import { useState, useCallback } from 'react';

const KEY = 'wc26_bankroll';
const INITIAL = 1000;

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    return d ?? { initial: INITIAL, balance: INITIAL, picks: [] };
  } catch {
    return { initial: INITIAL, balance: INITIAL, picks: [] };
  }
}

function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

let idCounter = Date.now();

/**
 * Tracks confirmed bets: picks (pending/won/lost), running bankroll balance.
 * Separate from BetSlipContext — BetSlip is a planning tool, Bankroll is the accounting record.
 */
export function useBankroll() {
  const [state, setState] = useState(load);

  const addPick = useCallback(({ matchId, homeTeam, awayTeam, outcome, label, odds, stake, prob, ev }) => {
    setState((prev) => {
      const pick = {
        id: String(++idCounter),
        matchId, homeTeam, awayTeam, outcome, label, odds,
        stake: Number(stake) || 0,
        prob, ev,
        timestamp: new Date().toISOString(),
        result: null,   // null | 'win' | 'loss' | 'push'
        profit: null,
      };
      const next = { ...prev, picks: [pick, ...prev.picks] };
      save(next);
      return next;
    });
  }, []);

  const resolvePick = useCallback((pickId, result) => {
    setState((prev) => {
      const picks = prev.picks.map((p) => {
        if (p.id !== pickId) return p;
        const profit =
          result === 'win'  ? p.stake * (p.odds - 1)
          : result === 'push' ? 0
          : -p.stake;
        return { ...p, result, profit };
      });
      const balance = picks.reduce(
        (b, p) => p.profit != null ? b + p.profit : b,
        prev.initial,
      );
      const next = { ...prev, picks, balance };
      save(next);
      return next;
    });
  }, []);

  const removePick = useCallback((pickId) => {
    setState((prev) => {
      const picks = prev.picks.filter((p) => p.id !== pickId);
      const balance = picks.reduce((b, p) => p.profit != null ? b + p.profit : b, prev.initial);
      const next = { ...prev, picks, balance };
      save(next);
      return next;
    });
  }, []);

  const setInitial = useCallback((amount) => {
    setState((prev) => {
      const bal = prev.picks.reduce((b, p) => p.profit != null ? b + p.profit : b, amount);
      const next = { ...prev, initial: amount, balance: bal };
      save(next);
      return next;
    });
  }, []);

  const clearBankroll = useCallback(() => {
    const next = { initial: INITIAL, balance: INITIAL, picks: [] };
    save(next);
    setState(next);
  }, []);

  const { initial, balance, picks } = state;
  const resolved = picks.filter((p) => p.result !== null);
  const wins = resolved.filter((p) => p.result === 'win').length;
  const losses = resolved.filter((p) => p.result === 'loss').length;
  const totalStaked = resolved.reduce((s, p) => s + p.stake, 0);
  const totalProfit = resolved.reduce((s, p) => s + (p.profit ?? 0), 0);
  const roi = totalStaked > 0 ? ((totalProfit / totalStaked) * 100).toFixed(1) : null;

  // Balance series for SVG chart (max last 20 points)
  const series = (() => {
    let b = initial;
    const pts = [b];
    for (const p of [...picks].reverse()) {
      if (p.profit != null) { b += p.profit; pts.push(b); }
    }
    return pts.slice(-20);
  })();

  return {
    initial, balance, picks, resolved,
    stats: { wins, losses, roi, totalStaked, totalProfit },
    series,
    addPick, resolvePick, removePick, setInitial, clearBankroll,
  };
}
