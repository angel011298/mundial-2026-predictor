import { useState, useEffect, useCallback, useMemo } from 'react';
import { Activity, Radio, CalendarClock, AlertTriangle } from 'lucide-react';
import worldcup from '../data/worldcup2026.json';
import { getLiveMatches, getProviderInfo } from '../services/sportsApiService.js';
import Header from './Header.jsx';
import GroupFilter from './GroupFilter.jsx';
import MatchCard from './MatchCard.jsx';

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
  const [matches, setMatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');

  const providerInfo = useMemo(() => getProviderInfo(), []);

  // Carga / actualización de datos (botón ACTUALIZAR EN TIEMPO REAL).
  const refresh = useCallback(async () => {
    setIsLoading(true);
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

  // Carga inicial al montar.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // "tick" para refrescar las etiquetas relativas ("hace X min").
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Filtrado en memoria.
  const filtered = useMemo(() => {
    return matches.filter((m) => {
      const okStatus = statusFilter === 'all' || m.status === statusFilter;
      const okGroup = groupFilter === 'all' || m.group === groupFilter;
      return okStatus && okGroup;
    });
  }, [matches, statusFilter, groupFilter]);

  const counts = useMemo(
    () => ({
      live: matches.filter((m) => m.status === 'live').length,
      upcoming: matches.filter((m) => m.status === 'upcoming').length,
      total: matches.length,
    }),
    [matches]
  );

  return (
    <div className="min-h-full">
      <Header
        tournament={worldcup.tournament}
        onRefresh={refresh}
        isLoading={isLoading}
        lastSync={lastSync}
        providerLabel={providerInfo.label}
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
