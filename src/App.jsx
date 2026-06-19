import { ShieldQuestion } from 'lucide-react';
import Dashboard from './components/Dashboard.jsx';

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <Dashboard />

      {/* Pie de página con aviso de juego responsable */}
      <footer className="mx-auto w-full max-w-md px-4 pb-8">
        <div className="flex items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <ShieldQuestion size={16} className="mt-0.5 shrink-0 text-zinc-500" />
          <p className="text-[11px] leading-relaxed text-zinc-500">
            <span className="font-semibold text-zinc-400">Juego responsable · +18.</span> Las
            predicciones, probabilidades y montos sugeridos son analíticos y educativos, no
            garantizan resultados. Apuesta solo lo que puedas permitirte perder. Si el juego deja de
            ser un entretenimiento, busca ayuda.
          </p>
        </div>
      </footer>
    </div>
  );
}
