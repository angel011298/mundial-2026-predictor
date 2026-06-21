import { useStandings } from '../hooks/useStandings.js';

function FormChar({ ch }) {
  const color = ch === 'W' ? 'bg-emerald-500' : ch === 'D' ? 'bg-zinc-500' : 'bg-rose-500';
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} title={ch === 'W' ? 'Victoria' : ch === 'D' ? 'Empate' : 'Derrota'} />;
}

function GroupTable({ groupId, teams }) {
  return (
    <section className="card overflow-hidden" aria-label={`Posiciones Grupo ${groupId}`}>
      <div className="flex items-center justify-between border-b border-zinc-800/60 px-4 py-2.5">
        <h2 className="text-sm font-bold text-zinc-100">Grupo {groupId}</h2>
        <span className="text-[10px] text-zinc-600 uppercase tracking-wide">PJ · G · E · P · DG · Pts</span>
      </div>
      <table className="w-full" role="table">
        <tbody>
          {teams.map((t, i) => {
            const qualifies = i < 2;
            const bubble = i === 0
              ? 'bg-emerald-500'
              : i === 1
              ? 'bg-emerald-500/40'
              : i === 2
              ? 'bg-zinc-600'
              : 'bg-transparent';
            return (
              <tr
                key={t.code}
                className={`border-b border-zinc-800/20 last:border-0 transition-colors hover:bg-zinc-900/40 ${qualifies ? '' : 'opacity-70'}`}
                aria-label={`${t.name}: ${t.Pts} puntos`}
              >
                <td className="py-2 pl-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-4 w-1 shrink-0 rounded-full ${bubble}`} aria-hidden="true" />
                    <span className="text-xs font-bold text-zinc-500 tabular-nums w-3">{i + 1}</span>
                    <span className="text-base leading-none" role="img" aria-label={t.name}>{t.flag}</span>
                    <span className={`text-xs font-semibold ${qualifies ? 'text-zinc-100' : 'text-zinc-400'}`}>
                      {t.name}
                    </span>
                  </div>
                </td>
                <td className="py-2 px-1 text-center text-xs tabular-nums text-zinc-500">{t.P}</td>
                <td className="py-2 px-1 text-center text-xs tabular-nums text-zinc-300 font-medium">{t.W}</td>
                <td className="py-2 px-1 text-center text-xs tabular-nums text-zinc-400">{t.D}</td>
                <td className="py-2 px-1 text-center text-xs tabular-nums text-zinc-400">{t.L}</td>
                <td className={`py-2 px-1 text-center text-xs tabular-nums font-semibold ${
                  t.GD > 0 ? 'text-emerald-400' : t.GD < 0 ? 'text-rose-400' : 'text-zinc-500'
                }`}>
                  {t.GD > 0 ? '+' : ''}{t.GD}
                </td>
                <td className={`py-2 pr-3 text-center text-sm font-black tabular-nums ${
                  qualifies ? 'text-emerald-300' : 'text-zinc-400'
                }`}>{t.Pts}</td>
                <td className="py-2 pr-3 hidden sm:table-cell">
                  <div className="flex items-center gap-0.5 justify-end">
                    {t.form?.split('').map((ch, fi) => <FormChar key={fi} ch={ch} />)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex gap-4 border-t border-zinc-800/40 px-4 py-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-600">
          <span className="h-2 w-1 rounded-full bg-emerald-500" /> Clasifica Ronda 32
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-600">
          <span className="h-2 w-1 rounded-full bg-zinc-600" /> Posible mejor 3°
        </span>
      </div>
    </section>
  );
}

export default function Standings({ matches, groups }) {
  const standings = useStandings(matches, groups);
  const groupIds = Object.keys(standings).sort();

  if (!groupIds.length) {
    return (
      <div className="card p-8 text-center text-sm text-zinc-500">
        No hay datos de grupos disponibles.
      </div>
    );
  }

  const finished = matches.filter((m) => m.status === 'finished').length;

  return (
    <div className="space-y-3">
      {finished === 0 && (
        <p className="text-[11px] text-zinc-600 text-center">
          Posiciones en 0 — actualizarán al cerrarse cada partido.
        </p>
      )}
      {groupIds.map((gid) => (
        <GroupTable key={gid} groupId={gid} teams={standings[gid]} />
      ))}
    </div>
  );
}
