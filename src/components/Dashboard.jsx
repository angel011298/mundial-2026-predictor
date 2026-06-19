import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Activity, Radio, CalendarClock, AlertTriangle } from 'lucide-react';
import worldcup from '../data/worldcup2026.json';
import { getLiveMatches, getProviderInfo } from '../services/sportsApiService.js';
import Header from './Header.jsx';
import GroupFilter from './GroupFilter.jsx';
import MatchCard from './MatchCard.jsx';

// Intervalo de auto-refresh según actividad:
// 45s con partidos en vivo, 90s sin partidos activos.
const INTERVAL_LIVE = 45;
const INTERVAL_IDLE = 90;

/** Tarjeta compacta de métrica para la fila de resumen. */
function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="card flex flex-col gap-1 p-3">
      <Icon size={16} className={tone} />
      <span className="text-xl font-extrabold leading-none tabular-nums text-zinc-50">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</span>
    </div>
  );
}

export default function Dashboard() {
  const [matches, setMatches]       = useState([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [lastSync, setLastSync]     = useState(null);
  const [error, setError]           = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupFilter, setGroupFilter]   = useState('all');
  const [countdown, setCountdown]   = useState(null); // segundos al próximo auto-refresh

  const providerInfo  = useMemo(() => getProviderInfo(), []);
  const autoTimerRef  = useRef(null);
  const countdownRef  = useRef(null);

  // ── Fetch principal ──────────────────────────────────────────────
  const refresh = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const data = await getLiveMatches();
      setMatches(data);
      setLastSync(Date.now());
    } catch (err) {
      setError('No se pudieron obtener los datos. Intenta de nuevo.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Auto-refresh inteligente ─────────────────────────────────────
  const scheduleAutoRefresh = useCallback((hasLive) => {
    // Limpia ciclos anteriores
    clearTimeout(autoTimerRef.current);
    clearInterval(countdownRef.current);

    const interval = hasLive ? INTERVAL_LIVE : INTERVAL_IDLE;
    let remaining  = interval;
    setCountdown(remaining);

    // Cuenta regresiva visible cada segundo
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) clearInterval(countdownRef.current);
    }, 1000);

    // Dispara el refresh al terminar el intervalo
    autoTimerRef.current = setTimeout(async () => {
      await refresh(true); // silent = no muestra spinner
    }, interval * 1000);
  }, [refresh]);

  // Cada vez que llegan nuevos datos, reprograma el auto-refresh
  useEffect(() => {
    if (lastSync === null) return;
    const hasLive = matches.some((m) => m.status === 'live');
    scheduleAutoRefresh(hasLive);
    return () => {
      clearTimeout(autoTimerRef.current);
      clearInterval(countdownRef.current);
    };
  }, [lastSync, matches, scheduleAutoRefresh]);

  // Carga inicial
  useEffect(() => { refresh(); }, [refresh]);

  // ── Filtrado en memoria ──────────────────────────────────────────
  const filtered = useMemo(() => matches.filter((m) => {
    const okStatus = statusFilter === 'all' || m.status === statusFilter;
    const okGroup  = groupFilter  === 'all' || m.group  === groupFilter;
    return okStatus && okGroup;
  }), [matches, statusFilter, groupFilter]);

  const counts = useMemo(() => ({
    live:     matches.filter((m) => m.status === 'live').length,
    upcoming: matches.filter((m) => m.status === 'upcoming').length,
    total:    matches.length,
  }), [matches]);

  const hasLiveNow = counts.live > 0;

  return (
    <div className="min-h-full">
      <Header
        tournament={worldcup.tournament}
        onRefresh={refresh}
        isLoading={isLoading}
        lastSync={lastSync}
        providerLabel={providerInfo.label}
        countdown={countdown}
        hasLive={hasLiveNow}
      />

      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-4">
        {/* Resumen */}
        <section className="mb-4 grid grid-cols-3 gap-2.5">
          <StatCard icon={Radio} label="En vivo" value={counts.live} tone="text-rose-400" />
          <StatCard icon={CalendarClock} label="Próximos" value={counts.upcoming} tone="text-violet-400" />
          <StatCard icon={Activity} label="Partidos" value={counts.total} tone="text-emerald-400" />
        </section>

        {/* Filtros */}
        <section className="mb-4">
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
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {/* Lista de partidos */}
        {isLoading && matches.length === 0 ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <section className="space-y-3">
            {filtered.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

/* ── Estados auxiliares ── */

function SkeletonList() {
  return (
    <section className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card h-44 animate-pulse bg-zinc-900/40" />
      ))}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center gap-2 p-8 text-center">
      <CalendarClock size={28} className="text-zinc-600" />
      <p className="text-sm font-semibold text-zinc-300">No hay partidos para este filtro</p>
      <p className="text-xs text-zinc-500">Prueba con otro grupo o estado, o vuelve a sincronizar.</p>
    </div>
  );
}
