import { FlaskConical, Trash2, CheckCircle2, XCircle } from 'lucide-react';

const OUTCOME_LABEL = { home: '1', draw: 'X', away: '2' };

function MetricCard({ label, value, sub, good, bad }) {
  const color = good ? 'text-emerald-300' : bad ? 'text-rose-400' : 'text-zinc-100';
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-center">
      <p className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1">{label}</p>
      <p className={`text-2xl font-black tabular-nums leading-tight ${color}`}>{value ?? '—'}</p>
      {sub && <p className="text-[9px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function RecordRow({ r }) {
  const correct = r.modelPick === r.actualResult;
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 gap-2 ${
      correct ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-zinc-800 bg-zinc-900/30'
    }`}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-zinc-300 truncate">
          {r.homeTeam} vs {r.awayTeam}
        </p>
        <p className="text-[10px] text-zinc-600">
          Pred: <span className="text-zinc-400 font-bold">{OUTCOME_LABEL[r.modelPick]}</span>
          {' · '}Real: <span className="text-zinc-400 font-bold">{OUTCOME_LABEL[r.actualResult] ?? '?'}</span>
          {r.wasValueBet && <span className="ml-1 text-emerald-500">⚡ Value</span>}
        </p>
      </div>
      <div className="flex flex-col items-end gap-0.5">
        {r.actualResult ? (
          correct
            ? <CheckCircle2 size={14} className="text-emerald-400" />
            : <XCircle size={14} className="text-rose-400" />
        ) : (
          <span className="text-[10px] text-zinc-600">Pendiente</span>
        )}
        {r.brierScore != null && (
          <span className="text-[9px] tabular-nums text-zinc-600">BS {r.brierScore.toFixed(2)}</span>
        )}
      </div>
    </div>
  );
}

export default function ModelScorecard({ records, stats, onClear }) {
  const { N, brierScore, accuracy, correct, vbN, vbROI } = stats;

  const bsGood = brierScore !== null && Number(brierScore) < 0.6;
  const bsBad  = brierScore !== null && Number(brierScore) > 0.8;
  const accGood = accuracy !== null && Number(accuracy) > 50;
  const roiGood = vbROI !== null && Number(vbROI) > 0;
  const roiBad  = vbROI !== null && Number(vbROI) < -15;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical size={14} className="text-violet-400" />
          <h2 className="text-sm font-extrabold text-zinc-100">Honestidad del modelo</h2>
        </div>
        {N > 0 && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Borrar historial del scorecard"
            className="rounded-md p-1.5 text-zinc-600 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {N === 0 ? (
        <div className="card p-6 text-center">
          <FlaskConical size={24} className="mx-auto mb-2 text-zinc-700" />
          <p className="text-sm text-zinc-400 font-semibold">Sin resultados cerrados aún</p>
          <p className="text-xs text-zinc-600 mt-1">
            Cuando finalicen partidos, aquí verás qué tan bien predijo el modelo.
          </p>
        </div>
      ) : (
        <>
          {/* Métricas clave */}
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="Brier Score"
              value={brierScore}
              sub="↓ menor es mejor (0=perfecto, 2=peor)"
              good={bsGood} bad={bsBad}
            />
            <MetricCard
              label="Acierto 1X2"
              value={accuracy !== null ? `${accuracy}%` : null}
              sub={`${correct}/${N} predicciones`}
              good={accGood}
            />
            <MetricCard
              label="ROI Value Bets"
              value={vbROI !== null ? `${vbROI > 0 ? '+' : ''}${vbROI}%` : null}
              sub={`${vbN} apuestas con valor`}
              good={roiGood} bad={roiBad}
            />
            <MetricCard
              label="Partidos"
              value={N}
              sub="con resultado conocido"
            />
          </div>

          {/* Calibración textual */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 mb-1.5">Calibración</p>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              {brierScore !== null && Number(brierScore) < 0.5
                ? '🟢 Excelente calibración — el modelo está muy bien ajustado.'
                : brierScore !== null && Number(brierScore) < 0.65
                ? '🟡 Calibración aceptable — dentro del rango esperado para fútbol.'
                : brierScore !== null
                ? '🔴 Calibración mejorable — se necesitan más datos y re-entrenamiento.'
                : 'Acumulando datos para calcular calibración…'}
            </p>
          </div>

          {/* Historial */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 mb-2">
              Historial de predicciones ({records.length})
            </p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {records.slice().reverse().map((r) => <RecordRow key={r.matchId} r={r} />)}
            </div>
          </div>
        </>
      )}

      <p className="text-[9px] text-zinc-700 text-center leading-relaxed">
        Brier score multiclase [0–2]: mide distancia entre probabilidades predichas y resultado binario.
        Los resultados son educativos — no reflejan performance real sin API en producción.
      </p>
    </div>
  );
}
