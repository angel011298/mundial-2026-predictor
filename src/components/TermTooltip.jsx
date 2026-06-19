import { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

/**
 * Tooltip de glosario para términos de apuestas.
 * Funciona en desktop (hover) y móvil (tap toggle).
 *
 * Props:
 *   label      — texto del término (o un nodo React)
 *   definition — explicación completa
 *   position   — 'top' | 'bottom'  (dónde aparece la burbuja)
 */
export default function TermTooltip({ label, definition, position = 'top' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Cerrar al hacer clic/tap fuera del componente.
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  const bubbleBase =
    'absolute z-50 w-64 rounded-xl border border-zinc-700/80 bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-300 shadow-2xl';
  const bubblePosition =
    position === 'top'
      ? 'bottom-full left-0 mb-2'
      : 'top-full left-0 mt-2';

  return (
    <span ref={ref} className="relative inline-flex items-center gap-1">
      {label && <span>{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Ver definición"
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-zinc-600 transition-colors hover:text-violet-400"
      >
        <Info size={12} strokeWidth={2.5} />
      </button>

      {open && (
        <span className={`${bubbleBase} ${bubblePosition}`}>
          {label && (
            <span className="mb-1 block font-bold text-zinc-100">{label}</span>
          )}
          {definition}
          {/* Caret decorativo */}
          <span
            className={`absolute left-4 h-2.5 w-2.5 rotate-45 border border-zinc-700/80 bg-zinc-900 ${
              position === 'top'
                ? '-bottom-1.5 border-t-0 border-l-0'
                : '-top-1.5 border-b-0 border-r-0'
            }`}
          />
        </span>
      )}
    </span>
  );
}
