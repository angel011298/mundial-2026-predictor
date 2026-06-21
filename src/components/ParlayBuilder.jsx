import { useMemo } from 'react';
import { AlertTriangle, Zap, TrendingUp, Wallet } from 'lucide-react';
import { buildParlay } from '../model/parlay.js';
import { recommendedStake } from '../model/kelly.js';
import { toneClasses } from '../utils/format.js';

function StatBox({ label, value, sub, tone = 'muted' }) {
  const colors = {
    emerald: 'text-emerald-300',
    rose:    'text-rose-300',
    amber:   'text-amber-300',
    violet:  'text-violet-300',
    muted:   'text-zinc-300',
  };
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 text-center">
      <p className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</p>
      <p className={`mt-0.5 text-base font-black tabular-nums leading-tight ${colors[tone] ?? colors.muted}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[9px] text-zinc-600">{sub}</p>}
    </div>
  );
}

/**
 * Muestra el cálculo de la combinada a partir de las patas del slip.
 * Es un componente de presentación pura — recibe legs[] y bankroll como props.
 */
export default function ParlayBuilder({ legs, bankroll }) {
  const parlay = useMemo(() => buildParlay(legs, { stake: bankroll ? bankroll * 0.01 : 10 }), [legs, bankroll]);

  const kelly = useMemo(() => {
    if (!parlay || parlay.combinedProb <= 0 || parlay.combinedOdds <= 1) return null;
    return recommendedStake(parlay.combinedProb, parlay.combinedOdds, { bankroll: bankroll || null });
  }, [parlay, bankroll]);

  if (!legs.length) return null;

  if (legs.length === 1) {
    const leg = legs[0];
    const stake = recommendedStake(leg.prob ?? 0.5, leg.odds ?? 2, { bankroll: bankroll || null });
    return (
      <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Zap size={12} className="text-amber-400" />
          <span className="text-[11px] font-semibold text-zinc-300">Apuesta simple</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatBox label="Cuota" value={leg.odds?.toFixed(2) ?? '—'} />
          <StatBox
            label="Stake ¼ Kelly"
            value={stake.hasValue ? `${stake.stakePct}%` : 'Sin valor'}
            sub={stake.stakeAmount ? `$${stake.stakeAmount.toFixed(0)}` : null}
            tone={stake.hasValue ? 'emerald' : 'muted'}
          />
        </div>
      </div>
    );
  }

  const evTone = parlay.ev > 0 ? 'emerald' : 'rose';
  const payoutVal = kelly?.stakeAmount
    ? `$${(kelly.stakeAmount * parlay.combinedOdds).toFixed(0)}`
    : `${parlay.combinedOdds.toFixed(2)}x`;

  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <TrendingUp size={12} className="text-violet-400" />
          <span className="text-[11px] font-semibold text-zinc-300">
            Combinada · {legs.length} patas
          </span>
        </div>
        {parlay.recommendation && (
          <span className={`chip border text-[10px] ${toneClasses[parlay.recommendation.tone] ?? toneClasses.muted}`}>
            {parlay.recommendation.level === 'ok'      && '✓ Con valor'}
            {parlay.recommendation.level === 'caution' && '⚠ Alta varianza'}
            {parlay.recommendation.level === 'avoid'   && '✕ Evitar'}
          </span>
        )}
      </div>

      {/* Advertencia de correlación */}
      {parlay.correlated && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/8 px-2.5 py-2">
          <AlertTriangle size={12} className="mt-0.5 shrink-0 text-rose-400" />
          <p className="text-[10px] leading-relaxed text-rose-300">
            <span className="font-bold">Patas correlacionadas:</span> hay resultados del mismo partido.
            La probabilidad combinada ∏P_i no es fiable. Se desaconseja esta combinada.
          </p>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatBox
          label="Cuota combinada"
          value={parlay.combinedOdds.toFixed(2)}
          sub="∏ cuotas"
        />
        <StatBox
          label="Prob. combinada"
          value={`${(parlay.combinedProb * 100).toFixed(1)}%`}
          sub="∏ probabilidades"
          tone={parlay.combinedProb > 0.4 ? 'emerald' : parlay.combinedProb > 0.2 ? 'amber' : 'rose'}
        />
        <StatBox
          label="EV combinado"
          value={`${parlay.ev > 0 ? '+' : ''}${parlay.ev?.toFixed(1)}%`}
          sub="valor esperado"
          tone={evTone}
        />
        <StatBox
          label={kelly?.stakeAmount ? 'Payout (¼ Kelly)' : 'Payout (×cuota)'}
          value={payoutVal}
          sub={kelly?.stakeAmount ? `stake $${kelly.stakeAmount.toFixed(0)}` : null}
          tone="violet"
        />
      </div>

      {/* Nota de varianza */}
      <p className="mt-2 text-[9px] leading-relaxed text-zinc-700">
        {parlay.explanation?.varianceNote} Cada pata agrega el overround de la casa.
        {!parlay.correlated && parlay.ev > 0 && ' EV positivo no garantiza acierto en pocas apuestas.'}
      </p>
    </div>
  );
}
