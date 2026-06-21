import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const META = {
  success: { Icon: CheckCircle2, cls: 'border-emerald-500/40 bg-emerald-950/95 text-emerald-300' },
  error:   { Icon: AlertTriangle, cls: 'border-rose-500/40 bg-rose-950/95 text-rose-300'         },
  info:    { Icon: Info,          cls: 'border-violet-500/40 bg-violet-950/95 text-violet-300'   },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const toast = useCallback((message, type = 'info', duration = 2800) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]); // max 4 visible
    const t = setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      duration,
    );
    return () => clearTimeout(t);
  }, []);

  const dismiss = useCallback(
    (id) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    [],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        aria-label="Notificaciones"
        className="pointer-events-none fixed left-0 right-0 top-4 z-[200] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => {
          const { Icon, cls } = META[t.type] ?? META.info;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md animate-toast-in ${cls}`}
            >
              <Icon size={15} className="shrink-0" aria-hidden="true" />
              <p className="flex-1 text-[13px] font-semibold leading-tight">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-lg p-1 opacity-60 transition-opacity hover:opacity-100"
                aria-label="Cerrar notificación"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
}
