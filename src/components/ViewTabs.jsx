import { Goal, Rows3, Trophy, ListChecks, Dices } from 'lucide-react';

const TABS = [
  { id: 'matches',   label: 'Partidos',  Icon: Goal },
  { id: 'standings', label: 'Grupos',    Icon: Rows3 },
  { id: 'bracket',   label: 'Bracket',   Icon: Trophy },
  { id: 'picks',     label: 'Mis Picks', Icon: ListChecks },
  { id: 'simulator', label: 'Simular',   Icon: Dices },
];

export default function ViewTabs({ active, onChange }) {
  return (
    <nav
      className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1 mb-4"
      role="tablist"
      aria-label="Sección principal"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          aria-controls={`panel-${tab.id}`}
          onClick={() => onChange(tab.id)}
          className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-2 text-[10px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
            active === tab.id
              ? 'bg-zinc-800 text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <tab.Icon size={15} aria-hidden="true" />
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
