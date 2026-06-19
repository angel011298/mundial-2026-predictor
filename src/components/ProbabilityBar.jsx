/**
 * Barra segmentada de probabilidades Victoria / Empate / Victoria.
 * Local = esmeralda, Empate = zinc, Visitante = violeta.
 */
export default function ProbabilityBar({ probabilities, home, away, pickKey }) {
  const segments = [
    { key: 'home', label: home.code, value: probabilities.home, color: 'bg-emerald-500' },
    { key: 'draw', label: 'X', value: probabilities.draw, color: 'bg-zinc-500' },
    { key: 'away', label: away.code, value: probabilities.away, color: 'bg-violet-500' },
  ];

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
        {segments.map((s) => (
          <div
            key={s.key}
            className={`${s.color} h-full origin-left animate-bar-grow transition-all ${
              pickKey === s.key ? '' : 'opacity-60'
            }`}
            style={{ width: `${s.value}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        {segments.map((s) => (
          <div key={s.key} className="flex flex-col items-center">
            <span
              className={`font-bold tabular-nums ${
                pickKey === s.key ? 'text-zinc-50' : 'text-zinc-400'
              }`}
            >
              {s.value}%
            </span>
            <span className="text-[10px] uppercase tracking-wide text-zinc-500">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
