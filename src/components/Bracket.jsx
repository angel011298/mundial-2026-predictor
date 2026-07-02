import { useState } from 'react';
import { useStandings } from '../hooks/useStandings.js';
import { Trophy, ChevronRight, CircleHelp } from 'lucide-react';

// Simplified 2026 WC R32 bracket structure
// 12 groups → top 2 (24) + 8 best 3rd = 32 teams → 16 R32 matches
const R32 = [
  { id: 'r32-1',  home: { g: 'A', p: 1 }, away: { g: 'B', p: 2 }, date: 'Jul 4' },
  { id: 'r32-2',  home: { g: 'B', p: 1 }, away: { g: 'A', p: 2 }, date: 'Jul 4' },
  { id: 'r32-3',  home: { g: 'C', p: 1 }, away: { g: 'D', p: 2 }, date: 'Jul 5' },
  { id: 'r32-4',  home: { g: 'D', p: 1 }, away: { g: 'C', p: 2 }, date: 'Jul 5' },
  { id: 'r32-5',  home: { g: 'E', p: 1 }, away: { g: 'F', p: 2 }, date: 'Jul 6' },
  { id: 'r32-6',  home: { g: 'F', p: 1 }, away: { g: 'E', p: 2 }, date: 'Jul 6' },
  { id: 'r32-7',  home: { g: 'G', p: 1 }, away: { g: 'H', p: 2 }, date: 'Jul 7' },
  { id: 'r32-8',  home: { g: 'H', p: 1 }, away: { g: 'G', p: 2 }, date: 'Jul 7' },
  { id: 'r32-9',  home: { g: 'I', p: 1 }, away: { g: 'J', p: 2 }, date: 'Jul 8' },
  { id: 'r32-10', home: { g: 'J', p: 1 }, away: { g: 'I', p: 2 }, date: 'Jul 8' },
  { id: 'r32-11', home: { g: 'K', p: 1 }, away: { g: 'L', p: 2 }, date: 'Jul 9' },
  { id: 'r32-12', home: { g: 'L', p: 1 }, away: { g: 'K', p: 2 }, date: 'Jul 9' },
  { id: 'r32-13', home: { label: '3° mejor 1' }, away: { label: '3° mejor 2' }, date: 'Jul 10' },
  { id: 'r32-14', home: { label: '3° mejor 3' }, away: { label: '3° mejor 4' }, date: 'Jul 10' },
  { id: 'r32-15', home: { label: '3° mejor 5' }, away: { label: '3° mejor 6' }, date: 'Jul 11' },
  { id: 'r32-16', home: { label: '3° mejor 7' }, away: { label: '3° mejor 8' }, date: 'Jul 11' },
];

const TBD_ROUNDS = [
  { round: 'R16',   matches: 8,  date: 'Jul 13–15' },
  { round: 'QF',    matches: 4,  date: 'Jul 18–19' },
  { round: 'SF',    matches: 2,  date: 'Jul 14–15' },
  { round: 'Final', matches: 1,  date: 'Jul 19' },
];

const ROUNDS = ['R32', 'R16', 'QF', 'SF', 'Final'];

function resolveSlot(slot, standings) {
  if (slot.label) return { name: slot.label, flag: null, tbd: true };
  const group = standings[slot.g];
  if (!group) return { name: `1° Grupo ${slot.g}`, flag: null, tbd: true };
  const team = group[slot.p - 1];
  if (!team) return { name: `${slot.p}° Grupo ${slot.g}`, flag: null, tbd: true };
  const isGroupComplete = group.every((t) => t.P >= 2);
  return { ...team, tbd: !isGroupComplete };
}

function BracketSlot({ slot, standings }) {
  const team = resolveSlot(slot, standings);
  return (
    <div className={`flex items-center gap-1.5 ${team.tbd ? 'opacity-50' : ''}`}>
      {team.flag
        ? <span className="text-base leading-none" role="img" aria-label={team.name}>{team.flag}</span>
        : <CircleHelp size={14} className="shrink-0 text-zinc-600" aria-hidden="true" />}
      <span className="text-xs font-semibold text-zinc-200 truncate max-w-[90px]">{team.name}</span>
    </div>
  );
}

function BracketMatch({ match, standings }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-zinc-600 uppercase tracking-wide">{match.date}</span>
        <span className="text-[10px] text-zinc-700">vs</span>
      </div>
      <BracketSlot slot={match.home} standings={standings} />
      <div className="border-t border-zinc-800/40" />
      <BracketSlot slot={match.away} standings={standings} />
    </div>
  );
}

function TbdRound({ round }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: round.matches }).map((_, i) => (
        <div key={i} className="rounded-xl border border-zinc-800/40 bg-zinc-900/20 px-3 py-3 text-center">
          <p className="text-xs text-zinc-600 italic">Por definir · {round.date}</p>
        </div>
      ))}
    </div>
  );
}

export default function Bracket({ matches, groups }) {
  const [activeRound, setActiveRound] = useState('R32');
  const standings = useStandings(matches, groups);

  const qualified = Object.values(standings).filter((g) => g.every((t) => t.P >= 2));
  const qualifiedCount = qualified.length * 2;

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="card p-3 flex items-center gap-3">
        <Trophy size={14} className="text-amber-400 shrink-0" />
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-zinc-400 font-semibold">Clasificados</span>
            <span className="text-[11px] tabular-nums font-black text-emerald-300">{qualifiedCount}/32</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-zinc-800">
            <div
              className="h-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${(qualifiedCount / 32) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Round selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Ronda del bracket">
        {ROUNDS.map((r) => (
          <button
            key={r}
            role="tab"
            aria-selected={activeRound === r}
            onClick={() => setActiveRound(r)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
              activeRound === r
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-zinc-900 text-zinc-500 border border-zinc-800 hover:text-zinc-300'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Round content */}
      <div role="tabpanel" aria-label={`Partidos ${activeRound}`}>
        {activeRound === 'R32' ? (
          <div className="grid grid-cols-2 gap-2">
            {R32.map((m) => (
              <BracketMatch key={m.id} match={m} standings={standings} />
            ))}
          </div>
        ) : (
          <TbdRound round={TBD_ROUNDS.find((r) => r.round === activeRound)} />
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[10px] text-zinc-700 px-1">
        <ChevronRight size={10} />
        Estructura simplificada · se actualizará con emparejamientos oficiales FIFA.
      </div>
    </div>
  );
}
