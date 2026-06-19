import { Trophy } from 'lucide-react';
import RefreshButton from './RefreshButton.jsx';

/** Cabecera fija (sticky) con identidad del torneo y botón de actualización. */
export default function Header({ tournament, ...refreshProps }) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-lg">
      <div className="mx-auto w-full max-w-md px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-emerald to-brand-violet shadow-glow">
            <Trophy size={20} className="text-zinc-950" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-extrabold leading-tight text-zinc-50">
              {tournament.name}
            </h1>
            <p className="truncate text-xs text-zinc-500">
              {tournament.hosts.join(' · ')} · {tournament.teamCount} selecciones
            </p>
          </div>
        </div>
        <RefreshButton {...refreshProps} />
      </div>
    </header>
  );
}
