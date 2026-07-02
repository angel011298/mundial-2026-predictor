import { useState, useId } from 'react';
import { SlidersHorizontal, ChevronDown, Zap } from 'lucide-react';

function ev(prob100, odds) {
  return odds > 1 ? (prob100 / 100) * odds * 100 - 100 : -100;
}

function SliderRow({ id, label, prob100, value, onChange }) {
  const evVal = ev(prob100, value);
  const implied = ((1 / value) * 100).toFixed(0);
  const hasValue = evVal > 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="min-w-0 truncate text-[11px] font-semibold text-zinc-400">
          {label}
        </label>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[12px] font-black tabular-nums text-zinc-100">{value.toFixed(2)}</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
              hasValue
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-rose-500/10 text-rose-400'
            }`}
          >
            {evVal > 0 ? '+' : ''}{evVal.toFixed(1)}%
          </span>
        </div>
      </div>

      <input
        id={id}
        type="range"
        min="1.05"
        max="20"
        step="0.05"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="slider w-full"
        aria-label={`Cuota hipotética ${label}`}
        aria-valuetext={`${value.toFixed(2)} cuota, EV ${evVal.toFixed(1)}%`}
      />

      <div className="flex justify-between text-[9px] text-zinc-700">
        <span>1.05</span>
        <span className="text-zinc-600">
          Implícito: {implied}% · Modelo: {prob100}%
        </span>
        <span>20.00</span>
      </div>
    </div>
  );
}

/**
 * Simulador interactivo de EV.
 * El usuario ajusta cuotas hipotéticas con sliders; el EV% se recalcula al instante.
 */
export default function WhatIfSlider({ analysis, currentOdds, home, away }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [homeOdds, setHomeOdds] = useState(() => currentOdds?.home ?? 2.0);
  const [drawOdds, setDrawOdds] = useState(() => currentOdds?.draw ?? 3.2);
  const [awayOdds, setAwayOdds] = useState(() => currentOdds?.away ?? 3.5);

  const probs = analysis?.probabilities;
  if (!probs) return null;

  const rows = [
    { key: 'home', label: home?.name ?? 'Local',  prob100: probs.home, value: homeOdds, setter: setHomeOdds },
    { key: 'draw', label: 'Empate',               prob100: probs.draw, value: drawOdds, setter: setDrawOdds },
    { key: 'away', label: away?.name ?? 'Visita', prob100: probs.away, value: awayOdds, setter: setAwayOdds },
  ];

  const anyPositive = rows.some((r) => ev(r.prob100, r.value) > 0);
  const sectionId = `${uid}-body`;

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={sectionId}
        className="flex w-full items-center justify-between px-3 py-2.5 transition-colors hover:bg-zinc-900/40"
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400">
          <SlidersHorizontal size={12} aria-hidden="true" />
          Simulador ¿qué pasaría si…?
        </span>
        <div className="flex items-center gap-2">
          {anyPositive && !open && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-400">
              <Zap size={10} aria-hidden="true" /> EV+ con estas cuotas
            </span>
          )}
          <ChevronDown
            size={13}
            className={`text-zinc-600 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </div>
      </button>

      {open && (
        <div id={sectionId} className="space-y-4 px-3 pb-4 pt-1 animate-fade-up">
          <p className="text-[10px] leading-relaxed text-zinc-600">
            Ajustá las cuotas hipotéticas para ver cómo varía el EV% según la probabilidad que
            asigna el modelo. EV = (P_modelo × cuota − 1) × 100.
          </p>
          {rows.map((r) => (
            <SliderRow
              key={r.key}
              id={`${uid}-${r.key}`}
              label={r.label}
              prob100={r.prob100}
              value={r.value}
              onChange={r.setter}
            />
          ))}
        </div>
      )}
    </div>
  );
}
