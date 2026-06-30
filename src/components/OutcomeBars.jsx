/**
 * Barras 1X2 con porcentajes exactos.
 * Estilo coherente con ProbabilityBar.jsx pero orientación horizontal con label.
 */
export default function OutcomeBars({ probs, home, away, loading = false }) {
  const segments = [
    {
      key:       'home',
      label:     home?.name ?? 'Local',
      code:      home?.code ?? '1',
      value:     probs?.home ?? 0,
      barColor:  'bg-emerald-500',
      textColor: 'text-emerald-300',
    },
    {
      key:       'draw',
      label:     'Empate',
      code:      'X',
      value:     probs?.draw ?? 0,
      barColor:  'bg-zinc-500',
      textColor: 'text-zinc-300',
    },
    {
      key:       'away',
      label:     away?.name ?? 'Visitante',
      code:      away?.code ?? '2',
      value:     probs?.away ?? 0,
      barColor:  'bg-violet-500',
      textColor: 'text-violet-300',
    },
  ];

  return (
    <div className="space-y-2.5" role="list">
      {segments.map(s => {
        const pct = s.value * 100;
        return (
          <div
            key={s.key}
            role="listitem"
            className="flex items-center gap-3"
            aria-label={`${s.label}: ${pct.toFixed(1)}%`}
          >
            {/* Código / etiqueta */}
            <span className="w-10 shrink-0 text-right text-[11px] font-bold text-zinc-400 tabular-nums">
              {s.code}
            </span>

            {/* Barra */}
            <div className="relative flex-1 h-4 overflow-hidden rounded-full bg-zinc-800">
              {loading ? (
                <div className="h-full w-2/3 animate-pulse rounded-full bg-zinc-700" />
              ) : (
                <div
                  className={`${s.barColor} h-full rounded-full origin-left animate-bar-grow
                               transition-[width] duration-500`}
                  style={{ width: `${Math.max(pct, 0)}%` }}
                />
              )}
            </div>

            {/* Porcentaje */}
            <span className={`w-12 shrink-0 text-right text-[12px] font-bold tabular-nums ${s.textColor}`}>
              {loading ? '—' : `${pct.toFixed(1)}%`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
