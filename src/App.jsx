import { ShieldQuestion } from 'lucide-react';
import Dashboard from './components/Dashboard.jsx';
import BetSlip from './components/BetSlip.jsx';
import ResponsibleGaming from './components/ResponsibleGaming.jsx';
import { BetSlipProvider } from './context/BetSlipContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';

export default function App() {
  return (
    <ToastProvider>
      <BetSlipProvider>
        <div className="min-h-screen bg-zinc-950 text-zinc-200">
          <Dashboard />

          <footer className="mx-auto w-full max-w-md px-4 pb-36">
            <div className="flex items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
              <ShieldQuestion size={16} className="mt-0.5 shrink-0 text-zinc-500" aria-hidden="true" />
              <p className="text-[11px] leading-relaxed text-zinc-500">
                <span className="font-semibold text-zinc-400">Juego responsable · +18.</span> Las
                predicciones son analíticas y educativas, no garantizan resultados. Apuesta solo lo
                que puedas permitirte perder. Si el juego deja de ser entretenimiento, buscá ayuda.
              </p>
            </div>
            <p className="mt-2 text-center text-[10px] text-zinc-700 tabular-nums">
              build {typeof __BUILD_STAMP__ !== 'undefined' ? __BUILD_STAMP__ : 'dev'}
            </p>
          </footer>

          <BetSlip />
          <ResponsibleGaming />
        </div>
      </BetSlipProvider>
    </ToastProvider>
  );
}
