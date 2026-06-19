import { useMemo, useState } from 'react';
import { TrendingUp, Target, Wallet, ChevronDown, Clock, Database } from 'lucide-react';
import { analyzeMatch } from '../utils/adviceEngine.js';
import { formatTime, toneClasses } from '../utils/format.js';
import ProbabilityBar from './ProbabilityBar.jsx';
import RiskBadge from './RiskBadge.jsx';
import StatPill from './StatPill.jsx';
import TermTooltip from './TermTooltip.jsx';

// ─── Sub-componentes ──────────────────────────────────────────────

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

/**
 * Sección de cuotas redeseñada:
 *  - Etiquetas claras: LOCAL / EMPATE / VISITANTE con código de equipo
 *  - Cuota decimal en grande
 *  - Porcentaje de ganancia potencial (+88%)
 *  - Badge "✓ Pick" en el resultado recomendado
 *  - Ejemplo de cuota en texto al pie
 */
function OddsSection({ home, away, odds, pickKey, pickOdds }) {
  const cols = [
    {
      key: 'home',
      primary: home.code,
      sublabel: 'Local',
      value: odds.home,
      accent: 'emerald',
    },
    {
      key: 'draw',
      primary: 'X',
      sublabel: 'Empate',
      value: odds.draw,
      accent: 'zinc',
    },
    {
      key: 'away',
      primary: away.code,
      sublabel: 'Visitante',
      value: odds.away,
      accent: 'violet',
    },
  ];

  // La cuota del pick recomendado para el ejemplo del pie
  const exampleOdds = pickOdds ?? odds.home;
  const exampleGain = Math.round((exampleOdds - 1) * 100);

  return (
    <div className="mt-3">
      {/* Cabecera de la sección */}
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {odds.source === 'model' ? 'Cuotas estimadas (modelo)' : 'Cuotas de mercado'}
        </span>
        <TermTooltip
          definition={
            odds.source === 'model'
              ? 'Cuotas calculadas por nuestro modelo matemático (rankings FIFA + forma reciente). No son cuotas de una casa de apuestas — son estimaciones analíticas.'
              : 'Cuotas en tiempo real obtenidas de una casa de apuestas. Representan la probabilidad implícita del mercado para cada resultado.'
          }
        />
      </div>

      {/* Tarjetas de cuota */}
      <div className="grid grid-cols-3 gap-2">
        {cols.map((col) => {
          const isPick = pickKey === col.key;
          const profit = Math.round((col.value - 1) * 100);
          return (
            <div
              key={col.key}
              className={`relative rounded-xl border px-2 py-2.5 text-center transition-all ${
                isPick
                  ? 'border-emerald-500/50 bg-emerald-500/10 shadow-glow'
                  : 'border-zinc-800 bg-zinc-900/50'
              }`}
            >
              {/* Código de equipo / X */}
              <div className={`text-[11px] font-extrabold uppercase tracking-wider ${
                isPick ? 'text-emerald-300' : 'text-zinc-300'
              }`}>
                {col.primary}
              </div>
              {/* Local / Empate / Visitante */}
              <div className="mb-1 text-[9px] uppercase tracking-wide text-zinc-600">
                {col.sublabel}
              </div>
              {/* Cuota */}
              <div className={`text-lg font-black tabular-nums leading-tight ${
                isPick ? 'text-emerald-200' : 'text-zinc-100'
              }`}>
                {col.value?.toFixed(2)}
              </div>
              {/* Ganancia potencial */}
              <div className={`mt-0.5 text-[10px] font-bold tabular-nums ${
                profit > 150
                  ? 'text-amber-400'
                  : profit > 80
                  ? 'text-emerald-400'
                  : 'text-zinc-500'
              }`}>
                +{profit}%
              </div>

              {/* Badge pick */}
              {isPick && (
                <div className="mt-1 rounded-full bg-emerald-500/20 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                  ✓ Pick
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Ejemplo en lenguaje natural */}
      <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
        Cuota {exampleOdds.toFixed(2)} = apuestas $100 →&nbsp;
        <span className="text-zinc-400">recibes ${Math.round(exampleOdds * 100)} si aciertas</span>
        &nbsp;(ganancia: <span className="text-emerald-500">${exampleGain}</span>)
      </p>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────

export default function MatchCard({ match }) {
  const [open, setOpen] = useState(false);
  const analysis = useMemo(() => analyzeMatch(match), [match]);

  const { home, away, odds, status, group, dataSource } = match;
  const showScore = status === 'live' || status === 'finished';

  return (
    <article className="card animate-fade-up overflow-hidden p-4 shadow-glow">
      {/* Cabecera */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="chip bg-zinc-800/60 text-zinc-400">Grupo {group}</span>
          {dataSource && dataSource !== 'demo' && (
            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-600">
              <Database size={10} />
              {dataSource === 'espn' ? 'ESPN' : dataSource}
            </span>
          )}
        </div>
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
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 border-t border-dashed border-zinc-800" />
          <span className="text-[10px] text-zinc-600">vs</span>
          <div className="h-px flex-1 border-t border-dashed border-zinc-800" />
        </div>
        <TeamRow
          team={away}
          score={away.score}
          isPick={analysis?.pick.key === 'away'}
          showScore={showScore}
        />
      </div>

      {/* Cuotas redeseñadas */}
      <OddsSection
        home={home}
        away={away}
        odds={odds}
        pickKey={analysis?.pick.key}
        pickOdds={analysis?.pick.odds}
      />

      {/* ─── Motor de Consejos ─── */}
      {analysis && (
        <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
          {/* Cabecera del análisis */}
          <div className="mb-3 flex items-center justify-between">
            <TermTooltip
              label={
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-violet-soft">
                  <TrendingUp size={14} /> Análisis IA
                </span>
              }
              definition="Motor de análisis que combina la distribución implícita de cuotas con rankings FIFA y forma reciente para estimar probabilidades y detectar valor estadístico."
              position="bottom"
            />
            <TermTooltip
              label={<RiskBadge risk={analysis.risk} />}
              definition={`Nivel de incertidumbre del partido (índice ${analysis.risk.score}/1.0). Calculado con entropía estadística del resultado + volatilidad de cuotas + disparidad de nivel entre equipos.`}
            />
          </div>

          {/* Barra de probabilidades */}
          <ProbabilityBar
            probabilities={analysis.probabilities}
            home={home}
            away={away}
            pickKey={analysis.pick.key}
          />

          {/* Pronóstico + Stake */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {/* Pronóstico */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
              <TermTooltip
                label={
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-zinc-500">
                    <Target size={12} /> Pronóstico
                  </div>
                }
                definition="El resultado con mayor probabilidad según el modelo. Mezcla cuotas implícitas del mercado (55%) con análisis de rendimiento de equipos (45%)."
                position="bottom"
              />
              <p className="mt-0.5 truncate text-sm font-bold text-emerald-300">
                {analysis.pick.label}
              </p>
              <p className="text-[11px] text-zinc-500">
                {analysis.pick.probability}% prob. · cuota {analysis.pick.odds.toFixed(2)}
              </p>
            </div>

            {/* Stake */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5">
              <TermTooltip
                label={
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-zinc-500">
                    <Wallet size={12} /> Stake sugerido
                  </div>
                }
                definition="Porcentaje de tu bankroll (presupuesto total de apuestas) que el Criterio de Kelly ¼ recomienda arriesgar. Ejemplo: si tu bankroll es $1,000 y el stake es 2.4%, apuesta $24. Máximo recomendado: 8%."
                position="bottom"
              />
              <p className="mt-0.5 text-sm font-bold tabular-nums text-zinc-100">
                {analysis.stake.hasValue
                  ? `${analysis.stake.stakePct}% del bankroll`
                  : '—'}
              </p>
              <span className={`chip mt-0.5 border text-[10px] ${toneClasses[analysis.stake.tone]}`}>
                {analysis.stake.label}
              </span>
            </div>
          </div>

          {/* Expandible: estadística clave */}
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
              <div className="flex items-start gap-1.5 rounded-lg bg-zinc-900/60 px-2.5 py-2">
                <Info size={11} className="mt-0.5 shrink-0 text-zinc-600" />
                <p className="text-[10px] leading-relaxed text-zinc-600">
                  <span className="text-zinc-500">Margen casa:</span> {analysis.margin}% ·{' '}
                  <span className="text-zinc-500">Kelly completo:</span> {analysis.stake.fullKellyPct}%
                  (se usa ¼ para reducir varianza) · Análisis educativo, no garantía.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// Necesario para el icono de Info en el bloque expandible
import { Info } from 'lucide-react';
