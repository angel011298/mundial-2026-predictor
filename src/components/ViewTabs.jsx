const TABS = [
  { id: 'matches',   label: 'Partidos',  emoji: '⚽' },
  { id: 'standings', label: 'Grupos',    emoji: '📊' },
  { id: 'bracket',  label: 'Bracket',   emoji: '🏆' },
  { id: 'picks',    label: 'Mis Picks', emoji: '📈' },
  { id: 'simulator', label: 'Simular',  emoji: '🎲' },
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
          className={`flex-1 rounded-lg py-2 text-[11px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
            active === tab.id
              ? 'bg-zinc-800 text-zinc-100 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <span aria-hidden="true">{tab.emoji}</span>{' '}
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
