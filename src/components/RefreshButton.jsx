import { RefreshCw, Wifi, Timer } from 'lucide-react';
import { timeAgo } from '../utils/format.js';

/**
 * Botón "ACTUALIZAR EN TIEMPO REAL" con:
 *  - Animación spin mientras sincroniza
 *  - Countdown visual al próximo auto-refresh
 *  - Indicador del proveedor activo
 */
export default function RefreshButton({
  onRefresh,
  isLoading,
  lastSync,
  providerLabel,
  countdown,
  hasLive,
}) {
  const showCountdown = countdown !== null && !isLoading;

  return (
    <div className="flex flex-col items-stretch gap-2">
      <button
        type="button"
        onClick={() => onRefresh(false)}
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

      {/* Barra de estado inferior */}
      <div className="flex items-center justify-between px-1 text-[11px] text-zinc-500">
        {/* Proveedor + estado */}
        <span className="inline-flex items-center gap-1">
          <Wifi size={12} className={isLoading ? 'text-amber-400' : 'text-emerald-400'} />
          {providerLabel}
        </span>

        {/* Última sync + countdown */}
        <span className="inline-flex items-center gap-2 tabular-nums">
          <span>{lastSync ? `Sync ${timeAgo(lastSync)}` : 'Sin sincronizar'}</span>

          {showCountdown && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                hasLive
                  ? 'bg-rose-500/15 text-rose-300'
                  : 'bg-zinc-800/80 text-zinc-400'
              }`}
              title="Auto-refresh automático"
            >
              <Timer size={10} />
              {countdown}s
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
