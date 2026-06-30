/**
 * Top-N marcadores exactos más probables, ordenados de mayor a menor.
 */
export default function TopScorelines({ scorelines, home, away }) {
  if (!scorelines?.length) return null;

  const maxP = scorelines[0]?.p ?? 0;

  return (
    <ol className="space-y-1.5" aria-label="Top 10 marcadores más probables">
      {scorelines.map(({ score, p }, idx) => {
        const [h, a]   = score.split('-').map(Number);
        const outcome  = h > a
          ? home?.code ?? '1'
          : h < a
          ? away?.code ?? '2'
          : 'X';
        const outColor = h > a
          ? 'text-emerald-500'
          : h < a
          ? 'text-violet-500'
          : 'text-zinc-500';
        const barW = maxP > 0 ? (p / maxP) * 100 : 0;

        return (
          <li
            key={score}
            className="flex items-center gap-2"
            aria-label={`${score}: ${(p * 100).toFixed(2)}%`}
          >
            {/* Posición */}
            <span className="w-4 shrink-0 text-right text-[10px] tabular-nums text-zinc-700">
              {idx + 1}
            </span>

            {/* Marcador */}
            <span className="w-8 shrink-0 text-center text-sm font-black tabular-nums text-zinc-100">
              {score}
            </span>

            {/* Barra proporcional */}
            <div className="flex-1 h-2.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-brand-emerald transition-[width] duration-500"
                style={{ width: `${barW}%` }}
              />
            </div>

            {/* Porcentaje */}
            <span className="w-11 shrink-0 text-right text-[11px] font-bold tabular-nums text-emerald-400">
              {(p * 100).toFixed(2)}%
            </span>

            {/* Resultado */}
            <span className={`w-8 shrink-0 text-center text-[10px] font-bold ${outColor}`}>
              {outcome}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
