/**
 * Filtros horizontales tipo "segmented control":
 *  - Estado del partido (Todos / En vivo / Próximos / Finalizados)
 *  - Grupo del Mundial (Todos / A…L)
 */
const STATUS_TABS = [
  { key: 'all', label: 'Todos' },
  { key: 'live', label: '🔴 En vivo' },
  { key: 'upcoming', label: 'Próximos' },
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
      {/* Estado */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onStatusChange(tab.key)}
            className={`chip shrink-0 border transition-colors ${
              statusFilter === tab.key
                ? 'border-brand-emerald/40 bg-brand-emerald/15 text-emerald-300'
                : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grupos */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          onClick={() => onGroupChange('all')}
          className={`chip shrink-0 border transition-colors ${
            groupFilter === 'all'
              ? 'border-brand-violet/40 bg-brand-violet/15 text-violet-300'
              : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Todos
        </button>
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => onGroupChange(g.id)}
            className={`chip h-7 w-9 shrink-0 justify-center border transition-colors ${
              groupFilter === g.id
                ? 'border-brand-violet/40 bg-brand-violet/15 text-violet-300'
                : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {g.id}
          </button>
        ))}
      </div>
    </div>
  );
}
