import { useState } from 'react';
import { Info, AlertTriangle, Zap, BookOpen } from 'lucide-react';
import { useMonteCarloSimulation } from '../hooks/useMonteCarloSimulation.js';

// ─── Opciones de iteraciones ─────────────────────────────────────────────────
const N_OPTIONS = [
  { label: '1 000',  value: 1_000,  time: '~0.1 s' },
  { label: '10 000', value: 10_000, time: '~1 s'   },
  { label: '50 000', value: 50_000, time: '~5 s'   },
];

// ─── Columnas de la tabla ─────────────────────────────────────────────────────
const COLS = [
  { key: 'pAdvance',  short: 'Cl.G',  title: 'P(clasificar de grupos → R32)' },
  { key: 'pR16',      short: 'Oct.',   title: 'P(llegar a Octavos de Final)'  },
  { key: 'pQF',       short: '4tos',   title: 'P(llegar a Cuartos de Final)'  },
  { key: 'pSF',       short: 'Semi',   title: 'P(llegar a Semifinal)'          },
  { key: 'pFinal',    short: 'Final',  title: 'P(llegar a la Final)'           },
  { key: 'pChampion', short: '🏆',     title: 'P(Campeón del Mundo)'           },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v) {
  if (v == null) return '—';
  const p = v * 100;
  if (p < 0.05) return '<0.1';
  if (p < 10)   return p.toFixed(1);
  return p.toFixed(0);
}

function cellCls(v) {
  if (!v) return 'text-zinc-700';
  if (v >= 0.30) return 'text-emerald-300 font-semibold';
  if (v >= 0.15) return 'text-emerald-400';
  if (v >= 0.05) return 'text-zinc-200';
  if (v >= 0.01) return 'text-zinc-400';
  return 'text-zinc-600';
}

function relTime(ts) {
  const diff = Math.round((Date.now() - ts) / 60_000);
  if (diff < 1)  return 'hace un momento';
  if (diff < 60) return `hace ${diff} min`;
  return new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function SimulatorView() {
  const [nIter, setNIter] = useState(10_000);
  const { status, progress, results, meta, run, cancel } = useMonteCarloSimulation();
  const isRunning = status === 'running';
  const pct       = Math.round(progress * 100);

  return (
    <div className="space-y-4 animate-fade-up">

      {/* ── Controles ─────────────────────────────────────────────────────── */}
      <div className="card p-4 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-zinc-100">Simulador Monte Carlo</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
            Corre N torneos completos (grupos → bracket) para estimar probabilidades por selección.
            El cálculo ocurre en un Web Worker sin bloquear la app.
          </p>
        </div>

        {/* Selector de iteraciones */}
        <div className="space-y-2">
          <span className="text-[11px] font-medium text-zinc-500">Iteraciones</span>
          <div className="flex gap-1.5">
            {N_OPTIONS.map(({ label, value, time }) => {
              const active = nIter === value;
              return (
                <button
                  key={value}
                  onClick={() => setNIter(value)}
                  disabled={isRunning}
                  aria-pressed={active}
                  className={[
                    'flex-1 rounded-xl py-2 text-[11px] font-bold leading-none transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    active
                      ? 'bg-brand-emerald text-zinc-950'
                      : 'bg-zinc-800/70 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60',
                  ].join(' ')}
                >
                  {label}
                  <span className="mt-1 block text-[9px] font-normal opacity-70">{time}</span>
                </button>
              );
            })}
          </div>

          {/* Aviso 50k */}
          {nIter === 50_000 && (
            <div
              role="alert"
              className="flex items-start gap-1.5 rounded-xl border border-amber-500/25
                         bg-amber-500/10 px-3 py-2"
            >
              <Zap size={12} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
              <p className="text-[10px] leading-relaxed text-amber-300">
                50 000 iteraciones pueden tardar 15–25 s en móvil y consumir más batería.
              </p>
            </div>
          )}
        </div>

        {/* Botón Simular / Cancelar */}
        <button
          onClick={isRunning ? cancel : () => run(nIter)}
          className={[
            'w-full rounded-xl py-2.5 text-sm font-bold transition-colors',
            isRunning
              ? 'border border-rose-500/30 bg-rose-500/15 text-rose-300'
              : 'bg-brand-emerald text-zinc-950 hover:bg-brand-emerald-soft',
          ].join(' ')}
        >
          {isRunning ? '✕  Cancelar' : '▶  Simular'}
        </button>

        {/* Barra de progreso */}
        {isRunning && (
          <div className="space-y-1" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-brand-emerald transition-[width] duration-200 ease-linear"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-right text-[10px] text-zinc-500">{pct}% completado</p>
          </div>
        )}

        {/* Info de caché */}
        {status === 'done' && meta && (
          <p className="text-[10px] text-zinc-600">
            Última corrida: {meta.nIterations.toLocaleString()} iteraciones · {relTime(meta.ts)}
          </p>
        )}
      </div>

      {/* ── Aviso de aproximación de terceros ────────────────────────────── */}
      <div
        role="note"
        className="flex items-start gap-2 rounded-xl border border-brand-violet/25
                   bg-brand-violet/8 p-3"
      >
        <Info size={13} className="mt-0.5 shrink-0 text-brand-violet-soft" aria-hidden="true" />
        <p className="text-[10px] leading-relaxed text-violet-300">
          <strong className="text-violet-200">Asignación de terceros aproximada.</strong>{' '}
          Los terceros clasificados se asignan por ranking de pts/GD, no por la tabla oficial FIFA
          (que depende de qué grupos aportaron terceros). Las probabilidades de equipos que
          quedaron terceros tienen mayor margen de error.
        </p>
      </div>

      {/* ── Estado vacío ──────────────────────────────────────────────────── */}
      {status === 'idle' && !results && (
        <div className="card flex flex-col items-center gap-3 py-12 text-center">
          <span className="text-4xl" aria-hidden="true">🎲</span>
          <div>
            <p className="text-sm font-semibold text-zinc-300">Listo para simular</p>
            <p className="mt-1 text-xs text-zinc-600">
              Elegí la cantidad de iteraciones y presioná Simular.
            </p>
          </div>
        </div>
      )}

      {/* ── Estado de error ───────────────────────────────────────────────── */}
      {status === 'error' && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-500/30
                     bg-rose-500/10 p-3 text-sm text-rose-300"
        >
          <AlertTriangle size={14} aria-hidden="true" />
          Error en la simulación. Recargá la página e intentá de nuevo.
        </div>
      )}

      {/* ── Tabla de resultados ───────────────────────────────────────────── */}
      {results && results.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[520px] text-[11px]"
              aria-label="Probabilidades por selección"
            >
              <thead>
                <tr className="border-b border-zinc-800">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-zinc-900 p-2 text-left
                               text-[10px] font-semibold text-zinc-500"
                  >
                    Equipo
                  </th>
                  {COLS.map(col => (
                    <th
                      key={col.key}
                      scope="col"
                      title={col.title}
                      className="p-2 text-center text-[10px] font-semibold
                                 text-zinc-500 whitespace-nowrap"
                    >
                      {col.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, idx) => (
                  <tr
                    key={r.code}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/25 transition-colors"
                  >
                    {/* Columna equipo (sticky) */}
                    <td className="sticky left-0 z-10 bg-zinc-900 p-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-base leading-none"
                          role="img"
                          aria-label={r.name}
                        >
                          {r.flag}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-zinc-100 truncate">{r.code}</div>
                          <div className="text-[9px] text-zinc-600 truncate">Gr. {r.groupId}</div>
                        </div>
                        {idx < 3 && (
                          <span
                            className="ml-auto text-[9px] font-bold text-brand-emerald"
                            aria-hidden="true"
                          >
                            #{idx + 1}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Columnas de probabilidades */}
                    {COLS.map(col => (
                      <td
                        key={col.key}
                        className={`p-2 text-center tabular-nums ${cellCls(r[col.key])}`}
                      >
                        {fmt(r[col.key])}
                        {col.key === 'pChampion' && r.se?.pChampion > 0.0005 && (
                          <span className="ml-0.5 text-[9px] text-zinc-600" aria-hidden="true">
                            ±{(r.se.pChampion * 100).toFixed(1)}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-zinc-800 px-3 py-2">
            <p className="text-[10px] text-zinc-600">
              Valores en %. ±SE binomial √(p·(1−p)/N) para P(Campeón). Ordenado por P(🏆) desc.
            </p>
          </div>
        </div>
      )}

      {/* ── Disclaimer educativo ──────────────────────────────────────────── */}
      <div className="flex items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
        <BookOpen size={13} className="mt-0.5 shrink-0 text-zinc-600" aria-hidden="true" />
        <p className="text-[10px] leading-relaxed text-zinc-600">
          <strong className="text-zinc-500">Uso educativo · +18.</strong>{' '}
          Las probabilidades son estimaciones del modelo Dixon–Coles + Elo y no constituyen
          predicciones garantizadas ni consejos de apuestas. Jugá responsablemente.
        </p>
      </div>

    </div>
  );
}
