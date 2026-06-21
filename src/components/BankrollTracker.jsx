import { useState } from 'react';
import { Wallet, Trash2, CheckCircle2, XCircle, Minus, Plus } from 'lucide-react';
import { useBankroll } from '../hooks/useBankroll.js';
import { useToast } from '../context/ToastContext.jsx';
import { useBetSlip } from '../context/BetSlipContext.jsx';

// ── SVG Balance Chart ─────────────────────────────────────────────────

function BalanceChart({ series, initial }) {
  if (series.length < 2) {
    return (
      <div className="h-24 flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40">
        <p className="text-[11px] text-zinc-600">Confirmar apuestas para ver la curva</p>
      </div>
    );
  }

  const W = 320, H = 80, PAD = 8;
  const min = Math.min(...series), max = Math.max(...series);
  const range = max - min || 1;
  const pts = series.map((v, i) => {
    const x = PAD + (i / (series.length - 1)) * (W - PAD * 2);
    const y = PAD + ((max - v) / range) * (H - PAD * 2);
    return `${x},${y}`;
  }).join(' ');

  const isUp = series[series.length - 1] >= series[0];
  const color = isUp ? '#10b981' : '#f43f5e';
  const fillColor = isUp ? '#10b98120' : '#f43f5e15';

  const areaBottom = `${PAD + (W - PAD * 2)},${H - PAD} ${PAD},${H - PAD}`;
  const areaPath = `M ${pts.replace(',', ' L ').replace(/ /g, ' ')} L ${areaBottom}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-xl border border-zinc-800 bg-zinc-900/40"
      role="img"
      aria-label={`Curva de bankroll: desde $${initial} hasta $${series[series.length-1].toFixed(0)}`}
    >
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <line x1={PAD} y1={PAD + ((max - initial) / range) * (H - PAD * 2)}
            x2={W - PAD} y2={PAD + ((max - initial) / range) * (H - PAD * 2)}
            stroke="#52525b" strokeWidth="0.5" strokeDasharray="3,3" />
    </svg>
  );
}

// ── Pick Row ──────────────────────────────────────────────────────────

const RESULT_COLORS = {
  win:  'border-emerald-500/20 bg-emerald-500/5',
  loss: 'border-rose-500/20 bg-rose-500/5',
  push: 'border-zinc-700 bg-zinc-900/40',
  null: 'border-zinc-800 bg-zinc-900/30',
};

function PickRow({ pick, onResolve, onRemove }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${RESULT_COLORS[pick.result]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-zinc-300 truncate">
            {pick.homeTeam} vs {pick.awayTeam}
          </p>
          <p className="text-[10px] text-zinc-500">
            {pick.label} · cuota {pick.odds?.toFixed(2)} · stake ${pick.stake}
          </p>
          {pick.profit != null && (
            <p className={`text-[11px] font-bold tabular-nums mt-0.5 ${pick.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {pick.profit >= 0 ? '+' : ''}${pick.profit.toFixed(2)}
            </p>
          )}
        </div>
        {pick.result === null ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onResolve(pick.id, 'win')}
              aria-label="Marcar ganada"
              className="rounded-md p-1 text-zinc-600 hover:bg-emerald-500/15 hover:text-emerald-400 transition-colors"
            ><CheckCircle2 size={13} /></button>
            <button
              type="button"
              onClick={() => onResolve(pick.id, 'push')}
              aria-label="Marcar empate/push"
              className="rounded-md p-1 text-zinc-600 hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
            ><Minus size={13} /></button>
            <button
              type="button"
              onClick={() => onResolve(pick.id, 'loss')}
              aria-label="Marcar perdida"
              className="rounded-md p-1 text-zinc-600 hover:bg-rose-500/15 hover:text-rose-400 transition-colors"
            ><XCircle size={13} /></button>
            <button
              type="button"
              onClick={() => onRemove(pick.id)}
              aria-label="Eliminar pick"
              className="rounded-md p-1 text-zinc-700 hover:bg-zinc-800 hover:text-zinc-400 transition-colors"
            ><Trash2 size={12} /></button>
          </div>
        ) : (
          <span className={`text-xs font-black shrink-0 ${
            pick.result === 'win' ? 'text-emerald-400'
            : pick.result === 'loss' ? 'text-rose-400'
            : 'text-zinc-400'
          }`}>
            {pick.result === 'win' ? 'GANADA' : pick.result === 'loss' ? 'PERDIDA' : 'PUSH'}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────

export default function BankrollTracker() {
  const { balance, initial, picks, series, stats, addPick, resolvePick, removePick, setInitial, clearBankroll } = useBankroll();
  const { legs, bankroll } = useBetSlip();
  const toast = useToast();
  const [stakeInput, setStakeInput] = useState('');
  const [initialDraft, setInitialDraft] = useState(String(initial));

  const profit = balance - initial;
  const profitPct = initial > 0 ? ((profit / initial) * 100).toFixed(1) : '0.0';
  const isProfit = profit >= 0;

  const importFromSlip = () => {
    if (!legs.length) { toast('El slip está vacío', 'info'); return; }
    for (const leg of legs) {
      const stake = Number(stakeInput) || (bankroll * 0.02);
      addPick({
        matchId:  leg.matchId,
        homeTeam: leg.matchLabel.split(' vs ')[0] || leg.matchLabel,
        awayTeam: leg.matchLabel.split(' vs ')[1] || '',
        outcome:  leg.outcome,
        label:    leg.label,
        odds:     leg.odds,
        stake,
        prob:     leg.prob,
      });
    }
    toast(`${legs.length} apuesta${legs.length > 1 ? 's' : ''} importada${legs.length > 1 ? 's' : ''}`, 'success');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet size={14} className="text-emerald-400" />
          <h2 className="text-sm font-extrabold text-zinc-100">Bankroll Tracker</h2>
        </div>
        {picks.length > 0 && (
          <button type="button" onClick={clearBankroll} aria-label="Reiniciar bankroll"
            className="rounded-md p-1.5 text-zinc-600 hover:bg-rose-500/10 hover:text-rose-400 transition-colors">
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* Balance principal */}
      <div className="card p-4">
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-zinc-600">Balance actual</p>
            <p className="text-3xl font-black tabular-nums text-zinc-50">
              ${balance.toFixed(2)}
            </p>
            <p className={`text-sm font-bold tabular-nums mt-0.5 ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isProfit ? '+' : ''}{profit >= 0 ? '+' : ''}${profit.toFixed(2)} ({profitPct}%)
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-zinc-600">W / L</p>
            <p className="text-lg font-black">
              <span className="text-emerald-400">{stats.wins}</span>
              <span className="text-zinc-600"> / </span>
              <span className="text-rose-400">{stats.losses}</span>
            </p>
            {stats.roi !== null && (
              <p className={`text-xs font-bold tabular-nums ${Number(stats.roi) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ROI {stats.roi}%
              </p>
            )}
          </div>
        </div>

        {/* Bankroll inicial configurable */}
        <div className="flex items-center gap-2 border-t border-zinc-800 pt-3">
          <p className="text-[10px] text-zinc-600 shrink-0">Bankroll inicial:</p>
          <div className="relative flex-1">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500">$</span>
            <input
              type="number" min="1" step="100"
              value={initialDraft}
              onChange={(e) => setInitialDraft(e.target.value)}
              onBlur={() => { const v = Number(initialDraft); if (v > 0) setInitial(v); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
              aria-label="Bankroll inicial"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-5 pr-2 py-1.5 text-[12px] text-zinc-200 tabular-nums transition-colors focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>
        </div>
      </div>

      {/* Curva de balance */}
      <BalanceChart series={series} initial={initial} />

      {/* Importar del slip */}
      {legs.length > 0 && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500">$</span>
            <input
              type="number" min="0" step="10"
              value={stakeInput}
              onChange={(e) => setStakeInput(e.target.value)}
              placeholder="Stake por pata"
              aria-label="Stake para importar del slip"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-5 pr-2 py-2 text-[12px] text-zinc-200 tabular-nums focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>
          <button type="button" onClick={importFromSlip}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition-colors">
            <Plus size={12} /> Importar slip ({legs.length})
          </button>
        </div>
      )}

      {/* Historial de picks */}
      {picks.length === 0 ? (
        <div className="card p-6 text-center">
          <Wallet size={24} className="mx-auto mb-2 text-zinc-700" />
          <p className="text-sm text-zinc-400 font-semibold">Sin picks registrados</p>
          <p className="text-xs text-zinc-600 mt-1">
            Importá apuestas del Bet Slip o añadí picks manualmente.
          </p>
        </div>
      ) : (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600 mb-2">
            Picks ({picks.length}) · marcalos como ganada / perdida
          </p>
          <div className="space-y-1.5">
            {picks.map((p) => (
              <PickRow key={p.id} pick={p} onResolve={resolvePick} onRemove={removePick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
