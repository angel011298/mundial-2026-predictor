import { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, X, Clock, AlertTriangle, ExternalLink, Settings } from 'lucide-react';

const KEY = 'wc26_rg';
const SESSION_START_KEY = 'wc26_session_start';

const DEFAULTS = {
  sessionLimitMin:  60,   // minutos
  lossLimit:        100,  // USD
  reminderEvery:    30,   // minutos
  enabled:          true,
};

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return DEFAULTS; }
}
function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

function getSessionStart() {
  try {
    const v = localStorage.getItem(SESSION_START_KEY);
    return v ? Number(v) : null;
  } catch { return null; }
}
function setSessionStart(ts) {
  try { localStorage.setItem(SESSION_START_KEY, String(ts)); } catch {}
}

function formatDuration(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

// ── Componente principal ───────────────────────────────────────────────

export default function ResponsibleGaming() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(loadSettings);
  const [sessionMs, setSessionMs] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  // Track session time
  useEffect(() => {
    const start = getSessionStart() || Date.now();
    if (!getSessionStart()) setSessionStart(start);

    const tick = () => setSessionMs(Date.now() - start);
    tick();
    const id = setInterval(tick, 30000); // update every 30s
    return () => clearInterval(id);
  }, []);

  // Check limits and emit alerts
  useEffect(() => {
    if (!settings.enabled) return;
    const sessionMin = sessionMs / 60000;
    const newAlerts = [];

    if (settings.sessionLimitMin > 0 && sessionMin >= settings.sessionLimitMin) {
      newAlerts.push({
        id:  'session',
        type:'warning',
        msg: `Llevas ${formatDuration(sessionMs)} en esta sesión. Tu límite es ${settings.sessionLimitMin} min.`,
      });
    }

    if (settings.reminderEvery > 0 && sessionMin > 0) {
      const remindersDue = Math.floor(sessionMin / settings.reminderEvery);
      if (remindersDue > 0 && sessionMin % settings.reminderEvery < 0.5) {
        newAlerts.push({
          id:  'reminder',
          type:'info',
          msg: `Recordatorio: llevás ${formatDuration(sessionMs)} apostando. Tomá un descanso.`,
        });
      }
    }

    setAlerts(newAlerts);
  }, [sessionMs, settings]);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), a, [tabindex="0"]')
        ).filter((el) => el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const updateSetting = useCallback((key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetSession = useCallback(() => {
    setSessionStart(Date.now());
    setSessionMs(0);
    setAlerts([]);
  }, []);

  const sessionMin = Math.floor(sessionMs / 60000);
  const overLimit = settings.sessionLimitMin > 0 && sessionMin >= settings.sessionLimitMin;

  return (
    <>
      {/* Alerta flotante si se excede el límite */}
      {alerts.length > 0 && !open && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-4 left-0 right-0 z-[150] flex justify-center px-4"
        >
          <div className="w-full max-w-md rounded-xl border border-amber-500/40 bg-amber-500/10 backdrop-blur-md p-3 flex items-start gap-2 shadow-2xl">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200 leading-relaxed flex-1">{alerts[0].msg}</p>
            <button type="button" onClick={resetSession} aria-label="Reiniciar timer de sesión"
              className="text-[10px] text-amber-400 font-bold shrink-0 hover:underline">Reiniciar</button>
            <button type="button" onClick={() => setAlerts([])} aria-label="Cerrar alerta"
              className="text-amber-600 hover:text-amber-400 shrink-0"><X size={12} /></button>
          </div>
        </div>
      )}

      {/* FAB — botón escudo */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Centro de Juego Responsable"
        aria-expanded={open}
        className={`fixed bottom-20 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
          overLimit
            ? 'border-amber-500/50 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
            : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
        }`}
      >
        <Shield size={16} aria-hidden="true" />
        {overLimit && (
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-500 border border-zinc-900" aria-hidden="true" />
        )}
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center" aria-modal="true" role="dialog" aria-label="Centro de Juego Responsable">
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            ref={panelRef}
            className="relative mx-auto w-full max-w-md rounded-t-2xl border border-zinc-800 bg-zinc-950 shadow-2xl max-h-[90dvh] flex flex-col animate-fade-up"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-emerald-400" />
                <h2 className="text-sm font-extrabold text-zinc-50">Juego Responsable</h2>
              </div>
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Cerrar"
                className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">
                <X size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

              {/* +18 banner */}
              <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/8 px-3 py-3">
                <span className="text-2xl font-black text-rose-400 leading-none shrink-0">+18</span>
                <p className="text-xs text-rose-200 leading-relaxed">
                  Esta app es solo para mayores de 18 años. Las apuestas pueden causar
                  adicción. Jugá con responsabilidad.
                </p>
              </div>

              {/* Aviso */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                <p className="text-[11px] text-amber-200 leading-relaxed">
                  ⚠️ <strong>No es asesoramiento financiero.</strong> Las predicciones son estimaciones
                  matemáticas con fines educativos. No garantizamos resultados. Nunca apostés más de lo
                  que podés permitirte perder.
                </p>
              </div>

              {/* Timer de sesión */}
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock size={12} className="text-zinc-600" />
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Sesión actual</p>
                </div>
                <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${
                  overLimit ? 'border-amber-500/40 bg-amber-500/8' : 'border-zinc-800 bg-zinc-900/60'
                }`}>
                  <div>
                    <p className={`text-2xl font-black tabular-nums ${overLimit ? 'text-amber-300' : 'text-zinc-100'}`}>
                      {formatDuration(sessionMs)}
                    </p>
                    <p className="text-[10px] text-zinc-600 mt-0.5">tiempo en esta sesión</p>
                  </div>
                  <button type="button" onClick={resetSession}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-bold text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors">
                    Reiniciar
                  </button>
                </div>
              </section>

              {/* Límites configurables */}
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <Settings size={12} className="text-zinc-600" />
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Mis límites</p>
                </div>
                <div className="space-y-3">
                  <LimitInput
                    label="Límite de sesión"
                    sub="minutos (0 = desactivado)"
                    value={settings.sessionLimitMin}
                    min={0} max={480} step={15}
                    onChange={(v) => updateSetting('sessionLimitMin', v)}
                  />
                  <LimitInput
                    label="Límite de pérdida"
                    sub="USD por sesión (0 = desactivado)"
                    value={settings.lossLimit}
                    min={0} max={10000} step={50}
                    prefix="$"
                    onChange={(v) => updateSetting('lossLimit', v)}
                  />
                  <LimitInput
                    label="Recordatorio cada"
                    sub="minutos (0 = desactivado)"
                    value={settings.reminderEvery}
                    min={0} max={120} step={15}
                    onChange={(v) => updateSetting('reminderEvery', v)}
                  />
                </div>
              </section>

              {/* Links de ayuda */}
              <section>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">
                  ¿Necesitás ayuda?
                </p>
                <div className="space-y-2">
                  <HelpLink label="Jugadores Anónimos (JA)" href="https://www.jugadoresanonimos.org/" />
                  <HelpLink label="GamCare — Asesoramiento" href="https://www.gamcare.org.uk/" />
                  <HelpLink label="Begambleaware.org" href="https://www.begambleaware.org/" />
                </div>
              </section>

              <p className="text-[9px] text-zinc-700 text-center leading-relaxed">
                Los límites se guardan en este dispositivo. Apagá las apuestas deportivas online si
                considerás que tenés un problema. Esta herramienta no reemplaza ayuda profesional.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LimitInput({ label, sub, value, min, max, step, prefix, onChange }) {
  const [draft, setDraft] = useState(String(value));
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-zinc-300">{label}</p>
        <p className="text-[10px] text-zinc-600">{sub}</p>
      </div>
      <div className="relative shrink-0 w-24">
        {prefix && (
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500">{prefix}</span>
        )}
        <input
          type="number"
          min={min} max={max} step={step}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const v = Math.max(min, Math.min(max, Number(draft) || 0));
            setDraft(String(v));
            onChange(v);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
          aria-label={label}
          className={`w-full rounded-lg border border-zinc-700 bg-zinc-900 ${prefix ? 'pl-5 pr-2' : 'px-2'} py-1.5 text-[12px] text-zinc-200 tabular-nums text-right focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30`}
        />
      </div>
    </div>
  );
}

function HelpLink({ label, href }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5 text-xs font-semibold text-zinc-300 hover:border-emerald-500/30 hover:text-emerald-300 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
    >
      {label}
      <ExternalLink size={11} className="text-zinc-600 group-hover:text-emerald-500 transition-colors" />
    </a>
  );
}
