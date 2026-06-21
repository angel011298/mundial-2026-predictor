import { useMemo } from 'react';

/**
 * Computes group standings from live match data + static group info.
 * Sort order: Points → GD → GF → alphabetical.
 */
export function useStandings(matches, groups) {
  return useMemo(() => {
    const table = {};
    groups.forEach((g) => {
      table[g.id] = g.teams.map((t) => ({
        ...t,
        P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0,
      }));
    });

    matches
      .filter((m) => m.status === 'finished' && m.home.score !== null && m.away.score !== null)
      .forEach((m) => {
        const g = table[m.group];
        if (!g) return;
        const home = g.find((t) => t.code === m.home.code);
        const away = g.find((t) => t.code === m.away.code);
        if (!home || !away) return;

        const hg = Number(m.home.score), ag = Number(m.away.score);
        home.P++; away.P++;
        home.GF += hg; home.GA += ag; home.GD = home.GF - home.GA;
        away.GF += ag; away.GA += hg; away.GD = away.GF - away.GA;

        if (hg > ag)      { home.W++; home.Pts += 3; away.L++; }
        else if (hg === ag){ home.D++; home.Pts++;   away.D++; away.Pts++; }
        else              { home.L++; away.W++;       away.Pts += 3; }
      });

    Object.values(table).forEach((g) =>
      g.sort((a, b) => b.Pts - a.Pts || b.GD - a.GD || b.GF - a.GF || a.name.localeCompare(b.name)),
    );

    return table;
  }, [matches, groups]);
}
