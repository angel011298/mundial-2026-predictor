import { useEffect, useRef } from 'react';
import { X, TrendingUp, Shield, Crosshair, BarChart2 } from 'lucide-react';

function FormDot({ ch }) {
  const base = 'h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-black';
  if (ch === 'W') return <span className={`${base} bg-emerald-500/20 text-emerald-400`}>G</span>;
  if (ch === 'D') return <span className={`${base} bg-zinc-700 text-zinc-400`}>E</span>;
  return <span className={`${base} bg-rose-500/20 text-rose-400`}>P</span>;
}

function Stat({ label, value, sub, highlight }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 text-center">
      <p className="text-[9px] uppercase tracking-wide text-zinc-600 mb-0.5">{label}</p>
      <p className={`text-lg font-black tabular-nums leading-tight ${highlight ? 'text-emerald-300' : 'text-zinc-100'}`}>
        {value}
      </p>
      {sub && <p className="text-[9px] text-zinc-600 mt-0.5">{sub}</p>}
    </div>
  );
}

function H2HRow({ match, teamCode }) {
  const isHome = match.home.code === teamCode;
  const opponent = isHome ? match.away : match.home;
  const teamScore = isHome ? match.home.score : match.away.score;
  const oppScore  = isHome ? match.away.score : match.home.score;
  const ts = Number(teamScore), os = Number(oppScore);
  const result = ts > os ? 'W' : ts < os ? 'L' : 'D';
  const color = result === 'W' ? 'text-emerald-400' : result === 'L' ? 'text-rose-400' : 'text-zinc-400';
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="text-base">{opponent.flag}</span>
        <span className="text-xs font-semibold text-zinc-300">{opponent.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs tabular-nums text-zinc-400 font-bold">
          {teamScore}–{oppScore}
        </span>
        <span className={`text-xs font-black ${color}`}>{result}</span>
      </div>
    </div>
  );
}

export default function TeamProfileModal({ team, match, matches, onClose }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(
          panelRef.current.querySelectorAll('button:not([disabled]), [tabindex="0"]')
        ).filter((el) => el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // H2H — find all tournament matches involving this team
  const teamMatches = matches.filter(
    (m) => (m.home.code === team.code || m.away.code === team.code) && m.status === 'finished'
  );

  // H2H vs current opponent specifically
  const opponent = match ? (match.home.code === team.code ? match.away : match.home) : null;
  const h2hMatches = opponent
    ? matches.filter(
        (m) => ((m.home.code === team.code && m.away.code === opponent.code) ||
                (m.home.code === opponent.code && m.away.code === team.code)) &&
               m.status === 'finished'
      )
    : [];

  // Tournament stats for this team
  const stats = teamMatches.reduce((acc, m) => {
    const isHome = m.home.code === team.code;
    const gf = Number(isHome ? m.home.score : m.away.score) || 0;
    const ga = Number(isHome ? m.away.score : m.home.score) || 0;
    acc.P++;
    acc.GF += gf; acc.GA += ga;
    if (gf > ga) acc.W++;
    else if (gf === ga) acc.D++;
    else acc.L++;
    return acc;
  }, { P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0 });

  const winRate = stats.P > 0 ? ((stats.W / stats.P) * 100).toFixed(0) : '—';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center"
      aria-modal="true"
      role="dialog"
      aria-label={`Perfil: ${team.name}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative mx-auto w-full max-w-md rounded-t-2xl border border-zinc-800 bg-zinc-950 shadow-2xl max-h-[85dvh] flex flex-col animate-fade-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <span className="text-3xl leading-none" role="img" aria-label={team.name}>{team.flag}</span>
            <div>
              <h2 className="text-base font-extrabold text-zinc-50">{team.name}</h2>
              <p className="text-[11px] text-zinc-500">
                #{team.rank} FIFA · Grupo {team.group || match?.group || '—'}
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar perfil"
            className="rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <X size={16} />
          </button>
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* Forma reciente */}
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp size={12} className="text-zinc-600" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Forma reciente</p>
            </div>
            <div className="flex items-center gap-1.5">
              {team.form?.split('').map((ch, i) => <FormDot key={i} ch={ch} />) || (
                <span className="text-xs text-zinc-600">Sin datos</span>
              )}
            </div>
          </section>

          {/* Estadísticas del equipo */}
          <section>
            <div className="flex items-center gap-1.5 mb-2">
              <BarChart2 size={12} className="text-zinc-600" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Estadísticas base</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Prom. GF" value={team.avgGF?.toFixed(1) ?? '—'} sub="por partido" highlight={team.avgGF >= 2} />
              <Stat label="Prom. GC" value={team.avgGA?.toFixed(1) ?? '—'} sub="por partido" />
              <Stat label="Porterías a 0" value={team.cleanSheets ?? '—'} sub="últimos 5" highlight={team.cleanSheets >= 3} />
            </div>
          </section>

          {/* Estadísticas del torneo */}
          {stats.P > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Shield size={12} className="text-zinc-600" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                  Este torneo ({stats.P} partido{stats.P !== 1 ? 's' : ''})
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <Stat label="G" value={stats.W} highlight={stats.W > 0} />
                <Stat label="E" value={stats.D} />
                <Stat label="P" value={stats.L} />
                <Stat label="DG" value={`${stats.GF > stats.GA ? '+' : ''}${stats.GF - stats.GA}`}
                  highlight={stats.GF > stats.GA} />
              </div>
              <p className="mt-1.5 text-[10px] text-zinc-600 text-center">
                Eficacia {winRate}% · {stats.GF} goles a favor
              </p>
            </section>
          )}

          {/* H2H en este torneo vs el rival actual */}
          {opponent && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Crosshair size={12} className="text-zinc-600" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                  H2H vs {opponent.name} (torneo)
                </p>
              </div>
              {h2hMatches.length === 0 ? (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-4 text-center">
                  <p className="text-xs text-zinc-500">Sin enfrentamientos previos en este torneo</p>
                  <p className="text-[10px] text-zinc-700 mt-1">
                    Datos históricos de WC disponibles con API externa
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {h2hMatches.map((m) => <H2HRow key={m.id} match={m} teamCode={team.code} />)}
                </div>
              )}
            </section>
          )}

          {/* Todos los partidos del torneo */}
          {teamMatches.length > 0 && (
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">
                Partidos jugados
              </p>
              <div className="space-y-1.5">
                {teamMatches.map((m) => <H2HRow key={m.id} match={m} teamCode={team.code} />)}
              </div>
            </section>
          )}

          <p className="text-[9px] text-zinc-700 text-center">
            xG e H2H histórico disponibles con BALLDONTLIE API · solo datos del torneo son en vivo.
          </p>
        </div>
      </div>
    </div>
  );
}
