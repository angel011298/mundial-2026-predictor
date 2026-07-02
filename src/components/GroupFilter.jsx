import { Radio } from 'lucide-react';

const STATUS_TABS = [
  { key: 'all',      label: 'Todos'       },
  { key: 'live',     label: 'En vivo', live: true },
  { key: 'upcoming', label: 'Próximos'    },
  { key: 'finished', label: 'Finalizados' },
];

export default function GroupFilter({
  groups,
  statusFilter,
  onStatusChange,
  groupFilter,
  onGroupChange,
}) {
  return (
    <div className="space-y-3">
      {/* Estado del partido */}
      <div
        role="group"
        aria-label="Filtrar por estado del partido"
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {STATUS_TABS.map((tab) => {
          const active = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onStatusChange(tab.key)}
              aria-pressed={active}
              className={`chip shrink-0 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/70 ${
                active
                  ? 'border-brand-emerald/40 bg-brand-emerald/15 text-emerald-300'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.live && <Radio size={11} className={active ? 'text-rose-400' : 'text-zinc-600'} aria-hidden="true" />}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Grupo del torneo */}
      <div
        role="group"
        aria-label="Filtrar por grupo del torneo"
        className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          onClick={() => onGroupChange('all')}
          aria-pressed={groupFilter === 'all'}
          className={`chip shrink-0 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70 ${
            groupFilter === 'all'
              ? 'border-brand-violet/40 bg-brand-violet/15 text-violet-300'
              : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Todos
        </button>
        {groups.map((g) => {
          const active = groupFilter === g.id;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onGroupChange(g.id)}
              aria-pressed={active}
              aria-label={`Grupo ${g.id}`}
              className={`chip h-7 w-9 shrink-0 justify-center border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70 ${
                active
                  ? 'border-brand-violet/40 bg-brand-violet/15 text-violet-300'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {g.id}
            </button>
          );
        })}
      </div>
    </div>
  );
}
