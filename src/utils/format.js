/** Utilidades de formato para la UI. */

/** Hora local corta, ej. "18:30". */
export function formatTime(date) {
  return new Date(date).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Etiqueta "hace X" para la última sincronización. */
export function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 5) return 'justo ahora';
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `hace ${hours} h`;
}

/** Clases de Tailwind por "tono" semántico (centraliza la paleta). */
export const toneClasses = {
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  muted: 'bg-zinc-700/30 text-zinc-400 border-zinc-600/40',
};
