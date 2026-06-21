import { useEffect, useState, useCallback } from 'react';
import { analyzeMatch } from '../utils/adviceEngine.js';

const KEY = 'wc26_scorecard';

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

/**
 * Auto-tracks model predictions vs actual results.
 * On each matches update:
 *   • new match → store prediction from adviceEngine
 *   • finished match + prediction stored → record actual result + Brier score
 */
export function useModelScorecard(matches) {
  const [records, setRecords] = useState(load);

  useEffect(() => {
    if (!matches.length) return;
    const stored = load();
    const byId = Object.fromEntries(stored.map((r) => [r.matchId, r]));
    let changed = false;

    for (const m of matches) {
      const existing = byId[m.id];

      if (!existing) {
        // Record pre-match prediction
        const analysis = analyzeMatch(m);
        if (!analysis) continue;
        const { probabilities, pick, value } = analysis;
        byId[m.id] = {
          matchId:   m.id,
          group:     m.group,
          homeTeam:  m.home.name,
          awayTeam:  m.away.name,
          kickoff:   m.kickoff,
          modelPick: pick.key,
          probHome:  (probabilities.home ?? 0) / 100,
          probDraw:  (probabilities.draw ?? 0) / 100,
          probAway:  (probabilities.away ?? 0) / 100,
          modelProb: pick.probability / 100,
          ev:        value?.bestValue?.ev ?? null,
          wasValueBet: value?.bestValue?.hasValue ?? false,
          bestOdds:  value?.bestValue?.bestOdds ?? null,
          actualResult: null,
          brierScore:   null,
        };
        changed = true;
      } else if (m.status === 'finished' && m.home.score !== null && existing.actualResult === null) {
        // Resolve result
        const hg = Number(m.home.score), ag = Number(m.away.score);
        const actual = hg > ag ? 'home' : hg < ag ? 'away' : 'draw';
        const { probHome: ph, probDraw: pd, probAway: pa } = existing;
        const aH = actual === 'home' ? 1 : 0;
        const aD = actual === 'draw' ? 1 : 0;
        const aA = actual === 'away' ? 1 : 0;
        const bs = (ph - aH) ** 2 + (pd - aD) ** 2 + (pa - aA) ** 2;
        byId[m.id] = { ...existing, actualResult: actual, brierScore: bs };
        changed = true;
      }
    }

    if (changed) {
      const next = Object.values(byId);
      save(next);
      setRecords(next);
    }
  }, [matches]);

  const clearScorecard = useCallback(() => {
    save([]);
    setRecords([]);
  }, []);

  // Compute aggregate stats from resolved records
  const resolved = records.filter((r) => r.actualResult !== null);
  const N = resolved.length;

  const brierScore = N > 0
    ? (resolved.reduce((s, r) => s + r.brierScore, 0) / N).toFixed(3)
    : null;

  const correct = resolved.filter((r) => r.modelPick === r.actualResult).length;
  const accuracy = N > 0 ? ((correct / N) * 100).toFixed(1) : null;

  const valueBets = resolved.filter((r) => r.wasValueBet);
  const vbN = valueBets.length;
  const vbROI = vbN > 0
    ? (() => {
        const profit = valueBets.reduce((s, r) => {
          const won = r.modelPick === r.actualResult;
          return s + (won ? (r.bestOdds ?? 2) - 1 : -1);
        }, 0);
        return ((profit / vbN) * 100).toFixed(1);
      })()
    : null;

  return {
    records,
    resolved,
    stats: { N, brierScore, accuracy, correct, vbN, vbROI },
    clearScorecard,
  };
}
