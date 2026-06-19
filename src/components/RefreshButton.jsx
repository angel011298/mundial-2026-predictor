import { RefreshCw, Wifi } from 'lucide-react';
import { timeAgo } from '../utils/format.js';

/**
 * Botón destacado "ACTUALIZAR EN TIEMPO REAL".
 *  - Animación de rotación (spin) sutil mientras sincroniza.
 *  - Indicador visual de la última hora de sincronización.
 */
export default function RefreshButton({ onRefresh, isLoading, lastSync, providerLabel }) {
  return (
    <div className="flex flex-col items-stretch gap-2">
      <button
        type="button"
        onClick={onRefresh}
        disabled={isLoading}
        aria-label="Actualizar datos en tiempo real"
        className={`group relative flex w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-3.5
          font-bold tracking-wide text-zinc-950 transition-all
          bg-gradient-to-r from-brand-emerald to-emerald-400
          hover:from-emerald-400 hover:to-emerald-300
          active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-80
          ${!isLoading ? 'animate-pulse-ring' : ''}`}
      >
        <RefreshCw
          size={19}
          strokeWidth={2.6}
          className={isLoading ? 'animate-spin' : 'transition-transform group-hover:rotate-180'}
        />
        {isLoading ? 'SINCRONIZANDO…' : 'ACTUALIZAR EN TIEMPO REAL'}
      </button>

      <div className="flex items-center justify-between px-1 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <Wifi size={12} className={isLoading ? 'text-amber-400' : 'text-emerald-400'} />
          {providerLabel}
        </span>
        <span className="tabular-nums">
          {lastSync ? `Sincronizado ${timeAgo(lastSync)}` : 'Sin sincronizar'}
        </span>
      </div>
    </div>
  );
}
