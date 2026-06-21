import { useState } from 'react';
import { FlaskConical, ChevronDown, CheckCircle2, XCircle, TrendingUp, BarChart2 } from 'lucide-react';
import { toneClasses } from '../utils/format.js';
import CalibrationCurve from './CalibrationCurve.jsx';

// ─── Helpers ──────────────────────────────────────────────────────

const SIGNAL_META = {
  dixonColes: { label: 'Poisson (Dixon-Coles)', short: 'DC',  color: 'violet' },
  elo:        { label: 'Rating Elo',             short: 'Elo', color: 'amber'  },
  market:     { label: 'Consenso de mercado',    short: 'Mkt', color: 'emerald'},
};

const OUTCOME_LABELS = { home: 'Local', draw: 'Empate', away: 'Visita' };

function pct(v) { return v != null ? `${(v * 100).toFixed(1)}%` : '—'; }

// ─── Sub-componentes ──────────────────────────────────────────────

function SignalChip({ signalKey, active, prob }) {
  const meta = SIGNAL_META[signalKey];
  if (!meta) return null;
  return (
    <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 ${
      active ? toneClasses[meta.color] : 'border-zinc-800 bg-zinc-900/40 text-zinc-600'
    }`}>
      {active
        ? <CheckCircle2 size={11} className="shrink-0" />
        : <XCircle     size={11} className="shrink-0" />}
      <div>
        <p className="text-[10px] font-bold">{meta.short}</p>
        {active && prob && (
          <p className="text-[9px] opacity-75 tabular-nums">
            {pct(prob.home)} / {pct(prob.draw)} / {pct(prob.away)}
          </p>
        )}
      </div>
    </div>
  );
}

function BlendRow({ signalKey, contribution, weight }) {
  const meta = SIGNAL_META[signalKey];
  if (!meta || !contribution) return null;
  const { home, draw, away } = contribution.contribution ?? {};
  return (
    <tr>
      <td className="py-1 pr-2 text-[10px] text-zinc-400">{meta.short}</td>
      <td className="py-1 px-2 text-center text-[10px] tabular-nums text-zinc-300">{pct(home)}</td>
      <td className="py-1 px-2 text-center text-[10px] tabular-nums text-zinc-300">{pct(draw)}</td>
      <td className="py-1 px-2 text-center text-[10px] tabular-nums text-zinc-300">{pct(away)}</td>
      <td className="py-1 pl-2 text-right text-[10px] tabular-nums text-zinc-500">
        {weight != null ? `${(weight * 100).toFixed(0)}%` : '—'}
      </td>
    </tr>
  );
}

function EVRow({ outcome }) {
  if (!outcome) return null;
  const hasValue = outcome.hasValue;
  return (
    <div className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 ${
      hasValue ? 'border-emerald-500/30 bg-emerald-500/8' : 'border-zinc-800 bg-zinc-900/30'
    }`}>
      <div>
        <p className={`text-[11px] font-semibold ${hasValue ? 'text-emerald-300' : 'text-zinc-400'}`}>
          {OUTCOME_LABELS[outcome.outcome] ?? outcome.outcome}
        </p>
        {outcome.bestBook && (
          <p className="text-[9px] text-zinc-600">Mejor casa: {outcome.bestBook} · cuota {outcome.bestOdds?.toFixed(2)}</p>
        )}
      </div>
      <div className="text-right">
        <p className={`text-[11px] font-black tabular-nums ${
          hasValue ? 'text-emerald-400' : outcome.ev < 0 ? 'text-rose-400' : 'text-zinc-500'
        }`}>
          {outcome.ev > 0 ? '+' : ''}{outcome.ev?.toFixed(1)}% EV
        </p>
        {outcome.edge != null && (
          <p className={`text-[9px] tabular-nums ${outcome.edge > 0 ? 'text-emerald-600' : 'text-zinc-600'}`}>
            edge {outcome.edge > 0 ? '+' : ''}{(outcome.edge * 100).toFixed(1)}%
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────

/**
 * Panel expandible con la justificación completa del modelo IA.
 * Muestra: señales activas, pesos del blend, EV por resultado y derivaciones (ou25/btts/topScore).
 */
export default function JustificationPanel({ analysis }) {
  const [open, setOpen] = useState(false);

  if (!analysis?.modelExplanation) return null;

  const { signalsUsed, modelExplanation, value, ou25, btts, topScore } = analysis;
  const { inputs, weights, contributions } = modelExplanation;

  const signalKeys = Object.keys(SIGNAL_META);
  const activeCount = signalKeys.filter((k) => signalsUsed?.[k]).length;

  return (
    <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950/40 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-zinc-900/30 transition-colors"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-violet-soft">
          <FlaskConical size={12} />
          Justificación del modelo
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-600">{activeCount}/3 señales</span>
          <ChevronDown size={13} className={`text-zinc-600 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="space-y-3 px-3 pb-3 animate-fade-up">

          {/* Señales activas */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Señales usadas
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {signalKeys.map((k) => (
                <SignalChip
                  key={k}
                  signalKey={k}
                  active={signalsUsed?.[k] ?? false}
                  prob={inputs?.[k]}
                />
              ))}
            </div>
          </div>

          {/* Tabla de contribuciones del blend */}
          {contributions && Object.keys(contributions).length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <BarChart2 size={10} className="text-zinc-600" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                  Contribución al blend (Local / X / Visita)
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800/60">
                      <th className="py-1 pr-2 text-left text-[9px] text-zinc-600">Señal</th>
                      <th className="py-1 px-2 text-center text-[9px] text-zinc-600">1</th>
                      <th className="py-1 px-2 text-center text-[9px] text-zinc-600">X</th>
                      <th className="py-1 px-2 text-center text-[9px] text-zinc-600">2</th>
                      <th className="py-1 pl-2 text-right text-[9px] text-zinc-600">Peso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {signalKeys.filter((k) => contributions[k]).map((k) => (
                      <BlendRow
                        key={k}
                        signalKey={k}
                        contribution={contributions[k]}
                        weight={weights?.[k]}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* EV por resultado */}
          {value?.outcomes?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingUp size={10} className="text-zinc-600" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                  Valor esperado (EV%) vs mejor cuota
                </p>
              </div>
              <div className="space-y-1">
                {value.outcomes.map((o) => <EVRow key={o.outcome} outcome={o} />)}
              </div>
              {value.explanation?.fairSource && (
                <p className="mt-1 text-[9px] text-zinc-700">
                  Prob. justa: {value.explanation.fairSource}
                  {value.explanation.bookCount ? ` · ${value.explanation.bookCount} casas` : ''}
                </p>
              )}
            </div>
          )}

          {/* Derivaciones del modelo Poisson */}
          {(ou25 || btts || topScore) && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                Derivaciones Poisson
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {topScore && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2 text-center">
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wide">Resultado</p>
                    <p className="text-sm font-black text-zinc-100">{topScore}</p>
                    <p className="text-[9px] text-zinc-600">más probable</p>
                  </div>
                )}
                {ou25 && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2 text-center">
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wide">Over 2.5</p>
                    <p className={`text-sm font-black ${ou25.over >= 0.55 ? 'text-emerald-300' : 'text-zinc-300'}`}>
                      {pct(ou25.over)}
                    </p>
                    <p className="text-[9px] text-zinc-600">prob.</p>
                  </div>
                )}
                {btts && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2 text-center">
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wide">BTTS</p>
                    <p className={`text-sm font-black ${btts.yes >= 0.55 ? 'text-emerald-300' : 'text-zinc-300'}`}>
                      {pct(btts.yes)}
                    </p>
                    <p className="text-[9px] text-zinc-600">ambos marcan</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Curva de calibración del modelo */}
          <CalibrationCurve matchCount={0} />

          <p className="text-[9px] text-zinc-700 leading-relaxed">
            Las probabilidades son estimaciones matemáticas, no garantías. Los pesos del blend son
            configurables y se calibrarán contra resultados reales del torneo.
          </p>
        </div>
      )}
    </div>
  );
}
