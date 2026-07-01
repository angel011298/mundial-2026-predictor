/** Utilidades de formato para la UI. */

/** Zona horaria fija del torneo: Ciudad de México (independiente del dispositivo del visitante). */
export const TOURNAMENT_TZ = 'America/Mexico_City';

/** Hora en horario de Ciudad de México, ej. "18:30". */
export function formatTime(date) {
  return new Date(date).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TOURNAMENT_TZ,
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

/** Mapa slug de fase (ESPN season.slug o stage interno) → etiqueta en español. */
const STAGE_LABELS = {
  'group':          'Fase de grupos',
  'group-stage':    'Fase de grupos',
  'round-of-32':    'Dieciseisavos',
  'round-of-16':    'Octavos de final',
  'quarterfinals':  'Cuartos de final',
  'quarterfinal':   'Cuartos de final',
  'semifinals':     'Semifinal',
  'semifinal':      'Semifinal',
  '3rd-place':      'Tercer puesto',
  'third-place':    'Tercer puesto',
  'final':          'Final',
};

/**
 * Etiqueta legible de la fase del torneo.
 * En fase de grupos usa "Grupo X"; en eliminatorias usa el nombre de la ronda.
 */
export function stageLabel(stage, group) {
  const s = (stage ?? '').toLowerCase();
  if (!s || s === 'group' || s === 'group-stage') {
    return group && group !== '—' ? `Grupo ${group}` : 'Fase de grupos';
  }
  return STAGE_LABELS[s] ?? stage;
}

/** ¿La fase es eliminatoria (no fase de grupos)? */
export function isKnockout(stage) {
  const s = (stage ?? '').toLowerCase();
  return Boolean(s) && s !== 'group' && s !== 'group-stage';
}

/** Clases de Tailwind por "tono" semántico (centraliza la paleta). */
export const toneClasses = {
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  muted: 'bg-zinc-700/30 text-zinc-400 border-zinc-600/40',
};
