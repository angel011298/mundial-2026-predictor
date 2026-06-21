import { useMemo, useState, useId } from 'react';
import { TrendingUp, Target, Wallet, ChevronDown, Clock, Database, Info, Check } from 'lucide-react';
import { analyzeMatch } from '../utils/adviceEngine.js';
import { formatTime, toneClasses } from '../utils/format.js';
import { useBetSlip } from '../context/BetSlipContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import ProbabilityBar from './ProbabilityBar.jsx';
import RiskBadge from './RiskBadge.jsx';
import StatPill from './StatPill.jsx';
import TermTooltip from './TermTooltip.jsx';
import JustificationPanel from './JustificationPanel.jsx';
import BookmakerCompare from './BookmakerCompare.jsx';
import GoalMatrix from './GoalMatrix.jsx';
import WhatIfSlider from './WhatIfSlider.jsx';

// ─── Sub-componentes ──────────────────────────────────────────────

function StatusTag({ status, minute, kickoff }) {
  if (status === 'live') {
    return (
      <span className="chip bg-rose-500/15 text-rose-300" role="status" aria-label={`En vivo, minuto ${minute}`}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" aria-hidden="true" />
        EN VIVO · {minute}&apos;
      </span>
    );
  }
  if (status === 'finished') return <span className="chip bg-zinc-700/40 text-zinc-400">Finalizado</span>;
  return (
    <span className="chip bg-zinc-800/60 text-zinc-400">
      <Clock size={12} aria-hidden="true" /> {formatTime(kickoff)}
    </span>
  );
}

function TeamRow({ team, score, isPick, showScore, onTeamClick }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-2xl leading-none" role="img" aria-label={team.name}>{team.flag}</span>
        <div className="min-w-0">
          <button
            type="button"
            onClick={onTeamClick}
            aria-label={`Ver perfil de ${team.name}`}
            className={`truncate text-sm font-bold text-left transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:underline ${
              isPick ? 'text-emerald-300' : 'text-zinc-100'
            }`}
          >
            {team.name}
          </button>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">
            #{team.rank} FIFA · {team.form}
          </p>
        </div>
      </div>
      {showScore && (
        <span className="ml-2 text-xl font-extrabold tabular-nums text-zinc-50"
              aria-label={`Marcador: ${score}`}>
          {score}
        </span>
      )}
    </div>
  );
}

function OddsSection({ home, away, odds, pickKey, match, analysis }) {
  const { addLeg, hasLeg } = useBetSlip();
  const toast = useToast();

  const cols = [
    { key: 'home', primary: home.code, sublabel: 'Local',     value: odds.home, label: `${home.name} gana` },
    { key: 'draw', primary: 'X',       sublabel: 'Empate',    value: odds.draw, label: 'Empate'             },
    { key: 'away', primary: away.code, sublabel: 'Visitante', value: odds.away, label: `${away.name} gana`  },
  ];

  const exampleOdds = odds[pickKey] ?? odds.home;
  const exampleGain = Math.round((exampleOdds - 1) * 100);

  const handleAdd = (col) => {
    if (!match) return;
    const prob = analysis?.probabilities?.[col.key];
    addLeg({
      matchId:    match.id,
      matchLabel: `${home.name} vs ${away.name}`,
      kickoff:    match.kickoff,
      outcome:    col.key,
      label:      col.label,
      prob:       prob != null ? prob / 100 : 0.5,
      odds:       col.value,
      homeCode:   home.code,
      awayCode:   away.code,
    });
    toast(`${col.label} añadido al slip`, 'success', 2000);
  };

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {odds.source === 'model' ? 'Cuotas estimadas (modelo)' : 'Cuotas de mercado'}
        </span>
        <TermTooltip
          definition={
            odds.source === 'model'
              ? 'Cuotas calculadas por el modelo. No son cuotas de una casa de apuestas.'
              : 'Cuotas en tiempo real de bookmaker.'
          }
        />
      </div>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Cuotas del partido — tap para añadir al slip">
        {cols.map((col) => {
          const isPick = pickKey === col.key;
          const added  = hasLeg(match?.id, col.key);
          const profit = Math.round((col.value - 1) * 100);
          return (
            <button
              key={col.key}
              type="button"
              onClick={() => handleAdd(col)}
              disabled={added || !match}
              aria-label={`${col.label}: cuota ${col.value?.toFixed(2)}${added ? ' — ya en slip' : ' — añadir al slip'}`}
              aria-pressed={added}
              className={`relative rounded-xl border px-2 py-2.5 text-center transition-all
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950
                ${added
                  ? 'border-violet-500/50 bg-violet-500/10 focus-visible:ring-violet-400'
                  : isPick
                  ? 'border-emerald-500/50 bg-emerald-500/10 shadow-glow hover:bg-emerald-500/15 focus-visible:ring-emerald-400'
                  : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900 focus-visible:ring-zinc-400'
                }`}
            >
              <div className={`text-[11px] font-extrabold uppercase tracking-wider ${
                added ? 'text-violet-300' : isPick ? 'text-emerald-300' : 'text-zinc-300'
              }`}>{col.primary}</div>
              <div className="mb-1 text-[9px] uppercase tracking-wide text-zinc-600">{col.sublabel}</div>
              <div className={`text-lg font-black tabular-nums leading-tight ${
                added ? 'text-violet-200' : isPick ? 'text-emerald-200' : 'text-zinc-100'
              }`}>{col.value?.toFixed(2)}</div>
              <div className={`mt-0.5 text-[10px] font-bold tabular-nums ${
                profit > 150 ? 'text-amber-400' : profit > 80 ? 'text-emerald-400' : 'text-zinc-500'
              }`}>+{profit}%</div>

              {added ? (
                <div className="mt-1 flex items-center justify-center gap-0.5 rounded-full bg-violet-500/20 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300">
                  <Check size={8} aria-hidden="true" /> Añadido
                </div>
              ) : isPick ? (
                <div className="mt-1 rounded-full bg-emerald-500/20 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                  ✓ Pick
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-600">
        Cuota {exampleOdds.toFixed(2)} = $100 →{' '}
        <span className="text-zinc-400">${Math.round(exampleOdds * 100)} si acertás</span>
        {' '}(+<span className="text-emerald-500">${exampleGain}</span>)
        {' · '}<span className="text-zinc-700">Tap cuota → añadir al slip</span>
      </p>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────

export default function MatchCard({ match, onTeamClick }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const analysis = useMemo(() => analyzeMatch(match), [match]);

  const { home, away, odds, status, group, dataSource } = match;
  const showScore = status === 'live' || status === 'finished';
  const bestValue = analysis?.value?.bestValue;
  const detailId  = `${uid}-detail`;

  return (
    <article
      className="card animate-fade-up overflow-hidden p-4 shadow-glow"
      aria-label={`Partido: ${home.name} vs ${away.name}, Grupo ${group}`}
    >
      {/* Cabecera */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="chip bg-zinc-800/60 text-zinc-400">Grupo {group}</span>
          {bestValue && (
            <span className="chip border border-emerald-500/30 bg-emerald-500/15 text-[10px] text-emerald-400">
              ⚡ Value +{bestValue.ev.toFixed(1)}%
            </span>
          )}
          {dataSource && dataSource !== 'demo' && (
            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-600">
              <Database size={10} aria-hidden="true" />
              {dataSource === 'espn' ? 'ESPN' : dataSource}
            </span>
          )}
        </div>
        <StatusTag status={status} minute={match.minute} kickoff={match.kickoff} />
      </div>

      {/* Equipos */}
      <div className="space-y-2.5">
        <TeamRow
          team={home} score={home.score} isPick={analysis?.pick.key === 'home'} showScore={showScore}
          onTeamClick={() => onTeamClick?.({ team: { ...home, group }, match })}
        />
        <div className="flex items-center gap-2" aria-hidden="true">
          <div className="h-px flex-1 border-t border-dashed border-zinc-800" />
          <span className="text-[10px] text-zinc-600">vs</span>
          <div className="h-px flex-1 border-t border-dashed border-zinc-800" />
        </div>
        <TeamRow
          team={away} score={away.score} isPick={analysis?.pick.key === 'away'} showScore={showScore}
          onTeamClick={() => onTeamClick?.({ team: { ...away, group }, match })}
        />
      </div>

      {/* Cuotas con botones de slip */}
      <OddsSection
        home={home}
        away={away}
        odds={odds}
        pickKey={analysis?.pick.key}
        match={match}
        analysis={analysis}
      />

      {/* ─── Análisis IA ─── */}
      {analysis && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="mb-3 flex items-center justify-between">
            <TermTooltip
              label={
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-violet-soft">
                  <TrendingUp size={14} aria-hidden="true" /> Análisis IA
                </span>
              }
              definition="Blend de tres señales: Poisson Dixon-Coles (40%) + Elo (25%) + Consenso de mercado des-vig (35%)."
              position="bottom"
            />
            <TermTooltip
              label={<RiskBadge risk={analysis.risk} />}
              definition={`Incertidumbre del partido (índice ${analysis.risk.score}/1.0). Entropía estadística + volatilidad + disparidad de nivel.`}
            />
          </div>

          <ProbabilityBar
            probabilities={analysis.probabilities}
            home={home}
            away={away}
            pickKey={analysis.pick.key}
          />

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
              <TermTooltip
                label={
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-zinc-500">
                    <Target size={12} aria-hidden="true" /> Pronóstico
                  </div>
                }
                definition="Resultado con mayor probabilidad según el blend de señales (DC 40% · Elo 25% · Mercado 35%)."
                position="bottom"
              />
              <p className="mt-0.5 truncate text-sm font-bold text-emerald-300">{analysis.pick.label}</p>
              <p className="text-[11px] text-zinc-500">
                {analysis.pick.probability}% prob. · cuota {analysis.pick.odds.toFixed(2)}
              </p>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
              <TermTooltip
                label={
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-zinc-500">
                    <Wallet size={12} aria-hidden="true" /> Stake sugerido
                  </div>
                }
                definition="¼ Kelly con tope 8% del bankroll. Configurá tu bankroll en el Bet Slip para el monto exacto."
                position="bottom"
              />
              <p className="mt-0.5 text-sm font-bold tabular-nums text-zinc-100">
                {analysis.stake.hasValue ? `${analysis.stake.stakePct}% del bankroll` : '—'}
              </p>
              <span className={`chip mt-0.5 border text-[10px] ${toneClasses[analysis.stake.tone]}`}>
                {analysis.stake.label}
              </span>
            </div>
          </div>

          {/* Toggle */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={detailId}
            className="mt-3 flex w-full items-center justify-center gap-1 text-[11px] font-semibold text-zinc-500 transition-colors hover:text-zinc-300"
          >
            {open ? 'Ocultar detalles' : 'Ver análisis detallado'}
            <ChevronDown
              size={13}
              aria-hidden="true"
              className={`transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Panel expandible */}
          {open && (
            <div id={detailId} className="mt-2 space-y-2 animate-fade-up">
              <StatPill text={analysis.keyStat} />

              <div className="flex items-start gap-1.5 rounded-lg bg-zinc-900/60 px-2.5 py-2">
                <Info size={11} className="mt-0.5 shrink-0 text-zinc-600" aria-hidden="true" />
                <p className="text-[10px] leading-relaxed text-zinc-600">
                  <span className="text-zinc-500">Margen casa:</span> {analysis.margin}% ·{' '}
                  <span className="text-zinc-500">Kelly completo:</span> {analysis.stake.fullKellyPct}%
                  {analysis.signalsUsed && (
                    <> · Señales:{' '}
                      {Object.entries(analysis.signalsUsed)
                        .filter(([, v]) => v)
                        .map(([k]) => (k === 'dixonColes' ? 'DC' : k === 'elo' ? 'Elo' : 'Mkt'))
                        .join('+')}
                    </>
                  )}
                  {' · '}Educativo, no garantía.
                </p>
              </div>

              {/* Simulador de cuotas what-if */}
              <WhatIfSlider analysis={analysis} currentOdds={odds} home={home} away={away} />

              {/* Heatmap de marcadores Poisson */}
              <GoalMatrix home={home} away={away} />

              {/* Justificación del modelo */}
              <JustificationPanel analysis={analysis} />

              {/* Comparador de casas (si hay datos) */}
              {match.markets?.some((m) => m.books?.length > 0) && (
                <BookmakerCompare match={match} />
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
