import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Trash2, ChevronUp, Wallet, BookOpen } from 'lucide-react';
import { useBetSlip } from '../context/BetSlipContext.jsx';
import ParlayBuilder from './ParlayBuilder.jsx';

const OUTCOME_TONE = { home: 'text-emerald-300', draw: 'text-zinc-300', away: 'text-violet-300' };

function LegItem({ leg, onRemove }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-zinc-200">
          {leg.homeFlag && <span aria-hidden="true">{leg.homeFlag} </span>}
          {leg.matchLabel}
          {leg.awayFlag && <span aria-hidden="true"> {leg.awayFlag}</span>}
        </p>
        <p className="text-[10px] text-zinc-500">
          <span className={OUTCOME_TONE[leg.outcome] ?? 'text-zinc-300'}>{leg.label}</span>
          {' · '}
          <span className="tabular-nums text-zinc-400">{leg.odds?.toFixed(2)}</span>
          {leg.prob != null && (
            <span className="text-zinc-600"> · {(leg.prob * 100).toFixed(0)}% prob.</span>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar ${leg.label} del slip`}
        className="shrink-0 rounded-md p-1 text-zinc-600 transition-colors hover:bg-rose-500/15 hover:text-rose-400"
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

export default function BetSlip() {
  const { legs, bankroll, isOpen, setBankroll, removeLeg, clearSlip, setIsOpen } = useBetSlip();
  const [bankrollDraft, setBankrollDraft] = useState(String(bankroll));
  const panelRef  = useRef(null);
  const inputRef  = useRef(null);
  const triggerRef = useRef(null); // element that opened the panel, to restore focus on close

  const count = legs.length;

  // Sync draft when bankroll changes externally
  useEffect(() => { setBankrollDraft(String(bankroll)); }, [bankroll]);

  // Escape closes slip; trap focus inside when open
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
        return;
      }
      // Tab cycling
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
          ),
        ).filter((el) => el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKey);

    // Move focus inside panel
    const firstEl = panelRef.current?.querySelector('button:not([disabled]), input:not([disabled])');
    firstEl?.focus({ preventScroll: true });

    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, setIsOpen]);

  const handleBankrollBlur = useCallback(() => {
    const val = parseFloat(bankrollDraft);
    if (!isNaN(val) && val >= 0) setBankroll(val);
    else setBankrollDraft(String(bankroll));
  }, [bankrollDraft, bankroll, setBankroll]);

  const handleBankrollKey = (e) => {
    if (e.key === 'Enter') inputRef.current?.blur();
  };

  if (count === 0 && !isOpen) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <div className="w-full max-w-md pointer-events-auto">

        {/* ── Barra colapsada ── */}
        {!isOpen && (
          <button
            type="button"
            ref={triggerRef}
            onClick={() => setIsOpen(true)}
            aria-expanded={false}
            aria-haspopup="dialog"
            aria-label={`Bet Slip: ${count} pata${count !== 1 ? 's' : ''} añadida${count !== 1 ? 's' : ''}`}
            className="flex w-full items-center justify-between rounded-t-2xl border border-zinc-800 bg-zinc-900/95 px-4 py-3 backdrop-blur-md shadow-2xl transition-colors hover:bg-zinc-900"
          >
            <div className="flex items-center gap-2">
              <BookOpen size={15} className="text-violet-400" aria-hidden="true" />
              <span className="text-sm font-bold text-zinc-100">Apuestas</span>
              <span className="chip bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[10px]">
                {count}
              </span>
            </div>
            <ChevronUp size={16} className="text-zinc-500" aria-hidden="true" />
          </button>
        )}

        {/* ── Panel expandido ── */}
        {isOpen && (
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Bet Slip — tus apuestas"
            className="rounded-t-2xl border border-zinc-800 bg-zinc-950/98 backdrop-blur-md shadow-2xl max-h-[82dvh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <BookOpen size={15} className="text-violet-400" aria-hidden="true" />
                <span className="text-sm font-bold text-zinc-100">Bet Slip</span>
                {count > 0 && (
                  <span className="chip bg-violet-500/20 text-violet-300 border border-violet-500/30 text-[10px]">
                    {count} {count === 1 ? 'pata' : 'patas'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {count > 0 && (
                  <button
                    type="button"
                    onClick={clearSlip}
                    aria-label="Vaciar todas las apuestas"
                    className="rounded-md p-1.5 text-zinc-600 transition-colors hover:bg-rose-500/15 hover:text-rose-400"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setIsOpen(false); triggerRef.current?.focus(); }}
                  aria-label="Cerrar slip (Escape)"
                  className="rounded-md p-1.5 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Contenido scrolleable */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {count === 0 ? (
                <div className="py-8 text-center">
                  <BookOpen size={28} className="mx-auto mb-3 text-zinc-700" aria-hidden="true" />
                  <p className="text-[13px] text-zinc-500">Sin apuestas añadidas</p>
                  <p className="mt-1 text-[11px] text-zinc-700">
                    Tapá una cuota en cualquier partido para agregar
                  </p>
                </div>
              ) : (
                <>
                  {legs.map((leg) => (
                    <LegItem
                      key={leg.id}
                      leg={leg}
                      onRemove={() => removeLeg(leg.id)}
                    />
                  ))}
                  <ParlayBuilder legs={legs} bankroll={bankroll} />
                </>
              )}
            </div>

            {/* Footer: bankroll */}
            <div className="border-t border-zinc-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <Wallet size={13} className="text-zinc-500 shrink-0" aria-hidden="true" />
                <label htmlFor="betslip-bankroll" className="shrink-0 text-[11px] text-zinc-500">
                  Bankroll:
                </label>
                <div className="relative flex-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500" aria-hidden="true">$</span>
                  <input
                    id="betslip-bankroll"
                    ref={inputRef}
                    type="number"
                    min="0"
                    step="100"
                    value={bankrollDraft}
                    onChange={(e) => setBankrollDraft(e.target.value)}
                    onBlur={handleBankrollBlur}
                    onKeyDown={handleBankrollKey}
                    aria-label="Tu bankroll total en dólares"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-5 pr-2 py-1.5 text-[12px] text-zinc-200 tabular-nums transition-colors focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
                    placeholder="1000"
                  />
                </div>
              </div>
              <p className="mt-1 text-[9px] text-zinc-700">
                El stake ¼ Kelly se calcula sobre este monto.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
