import { Sparkles } from 'lucide-react';

/** Píldora de Estadística Clave generada por el motor de consejos. */
export default function StatPill({ text }) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2">
      <Sparkles size={15} className="mt-0.5 shrink-0 text-brand-violet-soft" />
      <p className="text-xs leading-relaxed text-zinc-300">{text}</p>
    </div>
  );
}
