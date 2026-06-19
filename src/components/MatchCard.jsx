import { useMemo, useState } from 'react';
import { TrendingUp, Target, Wallet, ChevronDown, Clock } from 'lucide-react';
import { analyzeMatch } from '../utils/adviceEngine.js';
import { formatTime, toneClasses } from '../utils/format.js';
import ProbabilityBar from './ProbabilityBar.jsx';
import RiskBadge from './RiskBadge.jsx';
import StatPill from './StatPill.jsx';

/** Indicador de estado del partido. */
function StatusTag({ status, minute, kickoff }) {
  if (status === 'live') {
    return (
      <span className="chip bg-rose-500/15 text-rose-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
        EN VIVO · {minute}&apos;
      </span>
    );
  }
  if (status === 'finished') {
    return <span className="chip bg-zinc-700/40 text-zinc-400">Finalizado</span>;
  }
  return (
    <span className="chip bg-zinc-800/60 text-zinc-400">
      <Clock size={12} /> {formatTime(kickoff)}
    </span>
  );
}

/** Fila de un equipo: bandera, nombre, marcador. */
function TeamRow({ team, score, isPick, showScore }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-2xl leading-none">{team.flag}</span>
        <div className="min-w-0">
          <p className={`truncate text-sm font-bold ${isPick ? 'text-emerald-300' : 'text-zinc-100'}`}>
            {team.name}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
            #{team.rank} FIFA · {team.form}
          </p>
        </div>
      </div>
      {showScore && (
        <span className="ml-2 text-xl font-extrabold tabular-nums text-zinc-50">{score}</span>
      )}
    </div>
  );
}

export default function MatchCard({ match }) {
  const [open, setOpen] = useState(false);
  const analysis = useMemo(() => analyzeMatch(match), [match]);

  const { home, away, odds, status, group } = match;
  const showScore = status === 'live' || status === 'finished';

  return (
    <article className="card animate-fade-up overflow-hidden p-4 shadow-glow">
      {/* Cabecera */}
      <div className="mb-3 flex items-center justify-between">
        <span className="chip bg-zinc-800/60 text-zinc-400">Grupo {group}</span>
        <StatusTag status={status} minute={match.minute} kickoff={match.kickoff} />
      </div>

      {/* Equipos */}
      <div className="space-y-2.5">
        <TeamRow
          team={home}
          score={home.score}
          isPick={analysis?.pick.key === 'home'}
          showScore={showScore}
        />
        <div className="border-t border-dashed border-zinc-800" />
        <TeamRow
          team={away}
          score={away.score}
          isPick={analysis?.pick.key === 'away'}
          showScore={showScore}
        />
      </div>

      {/* Cuotas 1 X 2 */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: '1', value: odds.home, key: 'home' },
          { label: 'X', value: odds.draw, key: 'draw' },
          { label: '2', value: odds.away, key: 'away' },
        ].map((o) => (
          <div
            key={o.key}
            className={`rounded-xl border px-2 py-1.5 text-center ${
              analysis?.pick.key === o.key
                ? 'border-brand-emerald/40 bg-brand-emerald/10'
                : 'border-zinc-800 bg-zinc-900/50'
            }`}
          >
            <div className="text-[10px] font-semibold uppercase text-zinc-500">{o.label}</div>
            <div className="text-sm font-bold tabular-nums text-zinc-100">
              {o.value?.toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {/* ─── Bloque del Motor de Consejos ─── */}
      {analysis && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-violet-soft">
              <TrendingUp size={14} /> Análisis IA
            </span>
            <RiskBadge risk={analysis.risk} />
          </div>

          {/* Probabilidades */}
          <ProbabilityBar
            probabilities={analysis.probabilities}
            home={home}
            away={away}
            pickKey={analysis.pick.key}
          />

          {/* Recomendación + Stake */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-zinc-500">
                <Target size={12} /> Pronóstico
              </div>
              <p className="mt-0.5 truncate text-sm font-bold text-emerald-300">
                {analysis.pick.label}
              </p>
              <p className="text-[11px] text-zinc-500">
                {analysis.pick.probability}% · cuota {analysis.pick.odds.toFixed(2)}
              </p>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-zinc-500">
                <Wallet size={12} /> Stake sugerido
              </div>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-zinc-100">
                {analysis.stake.hasValue ? `${analysis.stake.stakePct}% bankroll` : '—'}
              </p>
              <span className={`chip mt-0.5 border ${toneClasses[analysis.stake.tone]}`}>
                {analysis.stake.label}
              </span>
            </div>
          </div>

          {/* Detalle expandible */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="mt-3 flex w-full items-center justify-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-zinc-300"
          >
            {open ? 'Ocultar' : 'Ver'} estadística clave
            <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && (
            <div className="mt-2 space-y-2 animate-fade-up">
              <StatPill text={analysis.keyStat} />
              <p className="px-1 text-[10px] leading-relaxed text-zinc-600">
                Margen de la casa: {analysis.margin}% · Kelly completo: {analysis.stake.fullKellyPct}%
                (se aplica ¼ de Kelly). Análisis con fines informativos.
              </p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
