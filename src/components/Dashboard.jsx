import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Activity, Radio, CalendarClock, AlertTriangle } from 'lucide-react';
import worldcup from '../data/worldcup2026.json';
import { getLiveMatches, getProviderInfo } from '../services/dataFusion.js';
import { useToast } from '../context/ToastContext.jsx';
import Header from './Header.jsx';
import GroupFilter from './GroupFilter.jsx';
import MatchCard from './MatchCard.jsx';

const INTERVAL_LIVE = 45;
const INTERVAL_IDLE = 90;

const VALID_STATUSES = new Set(['all', 'live', 'upcoming', 'finished']);

function readParam(key, validSet, fallback) {
  try {
    const v = new URLSearchParams(window.location.search).get(key);
    return v && (!validSet || validSet.has(v)) ? v : fallback;
  } catch { return fallback; }
}

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="card flex flex-col gap-1 p-3" role="status" aria-label={`${label}: ${value}`}>
      <Icon size={16} className={tone} aria-hidden="true" />
      <span className="text-xl font-extrabold leading-none tabular-nums text-zinc-50">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
    </div>
  );
}

export default function Dashboard() {
  const toast = useToast();

  const [matches, setMatches]   = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [error, setError]       = useState(null);
  const [countdown, setCountdown] = useState(null);

  // ── Filters — initialized from URL ────────────────────────────────
  const [statusFilter, setStatusFilterState] = useState(
    () => readParam('status', VALID_STATUSES, 'all'),
  );
  const [groupFilter, setGroupFilterState] = useState(
    () => readParam('group', null, 'all'),
  );

  // Write-through setters that also update the URL
  const setStatusFilter = useCallback((v) => {
    setStatusFilterState(v);
    try {
      const p = new URLSearchParams(window.location.search);
      v === 'all' ? p.delete('status') : p.set('status', v);
      window.history.replaceState(null, '', p.toString() ? `?${p}` : window.location.pathname);
    } catch {}
  }, []);

  const setGroupFilter = useCallback((v) => {
    setGroupFilterState(v);
    try {
      const p = new URLSearchParams(window.location.search);
      v === 'all' ? p.delete('group') : p.set('group', v);
      window.history.replaceState(null, '', p.toString() ? `?${p}` : window.location.pathname);
    } catch {}
  }, []);

  const providerInfo  = useMemo(() => getProviderInfo(), []);
  const autoTimerRef  = useRef(null);
  const countdownRef  = useRef(null);

  // ── Fetch ──────────────────────────────────────────────────────────
  const refresh = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const data = await getLiveMatches();
      setMatches(data);
      setLastSync(Date.now());
      if (!silent) toast(`${data.length} partidos sincronizados`, 'success');
    } catch (err) {
      setError('No se pudieron obtener los datos. Intenta de nuevo.');
      toast('Error al sincronizar datos', 'error');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // ── Auto-refresh ───────────────────────────────────────────────────
  const scheduleAutoRefresh = useCallback((hasLive) => {
    clearTimeout(autoTimerRef.current);
    clearInterval(countdownRef.current);
    const interval = hasLive ? INTERVAL_LIVE : INTERVAL_IDLE;
    let remaining = interval;
    setCountdown(remaining);
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) clearInterval(countdownRef.current);
    }, 1000);
    autoTimerRef.current = setTimeout(() => refresh(true), interval * 1000);
  }, [refresh]);

  useEffect(() => {
    if (lastSync === null) return;
    const hasLive = matches.some((m) => m.status === 'live');
    scheduleAutoRefresh(hasLive);
    return () => {
      clearTimeout(autoTimerRef.current);
      clearInterval(countdownRef.current);
    };
  }, [lastSync, matches, scheduleAutoRefresh]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Filtrado ───────────────────────────────────────────────────────
  const filtered = useMemo(
    () =>
      matches.filter((m) => {
        const okStatus = statusFilter === 'all' || m.status === statusFilter;
        const okGroup  = groupFilter  === 'all' || m.group  === groupFilter;
        return okStatus && okGroup;
      }),
    [matches, statusFilter, groupFilter],
  );

  const counts = useMemo(() => ({
    live:     matches.filter((m) => m.status === 'live').length,
    upcoming: matches.filter((m) => m.status === 'upcoming').length,
    total:    matches.length,
  }), [matches]);

  return (
    <div className="min-h-full">
      <Header
        tournament={worldcup.tournament}
        onRefresh={refresh}
        isLoading={isLoading}
        lastSync={lastSync}
        providerLabel={providerInfo.label}
        countdown={countdown}
        hasLive={counts.live > 0}
      />

      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4" id="main-content">
        {/* Resumen */}
        <section className="mb-4 grid grid-cols-3 gap-2.5" aria-label="Resumen de partidos">
          <StatCard icon={Radio}        label="En vivo"  value={counts.live}     tone="text-rose-400"    />
          <StatCard icon={CalendarClock} label="Próximos" value={counts.upcoming} tone="text-violet-400" />
          <StatCard icon={Activity}     label="Partidos" value={counts.total}    tone="text-emerald-400" />
        </section>

        {/* Filtros */}
        <section className="mb-4" aria-label="Filtros">
          <GroupFilter
            groups={worldcup.groups}
            statusFilter={statusFilter}
            onStatusChange={setStatusFilter}
            groupFilter={groupFilter}
            onGroupChange={setGroupFilter}
          />
        </section>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300"
          >
            <AlertTriangle size={16} aria-hidden="true" /> {error}
          </div>
        )}

        {/* Lista de partidos */}
        {isLoading && matches.length === 0 ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <section
            className="space-y-3"
            aria-label={`${filtered.length} partido${filtered.length !== 1 ? 's' : ''}`}
            aria-live="polite"
            aria-busy={isLoading}
          >
            {filtered.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

function SkeletonList() {
  return (
    <section className="space-y-3" aria-label="Cargando partidos" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card h-44 animate-pulse bg-zinc-900/40" aria-hidden="true" />
      ))}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center gap-2 p-8 text-center" role="status">
      <CalendarClock size={28} className="text-zinc-600" aria-hidden="true" />
      <p className="text-sm font-semibold text-zinc-300">No hay partidos para este filtro</p>
      <p className="text-xs text-zinc-500">Probá con otro grupo o estado, o volvé a sincronizar.</p>
    </div>
  );
}
