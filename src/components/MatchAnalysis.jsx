import { useState, useMemo, useEffect, useRef } from 'react';
import { X, BarChart2, Cpu, ChevronDown, BookOpen, Zap, Share2, Loader2 } from 'lucide-react';
import { exportAnalysis } from '../utils/exportAnalysis.js';
import { dixonColesProbs, poisson } from '../model/dixonColes.js';
import { analyzeMatch } from '../utils/adviceEngine.js';
import crosswalk from '../data/team-crosswalk.json';
import { stageLabel, isKnockout } from '../utils/format.js';
import ScorelineHeatmap from './ScorelineHeatmap.jsx';
import OutcomeBars from './OutcomeBars.jsx';
import TopScorelines from './TopScorelines.jsx';
import JustificationPanel from './JustificationPanel.jsx';

// ─── Constantes ───────────────────────────────────────────────────────────────
const LEAGUE_AVG  = 1.32;
const MAX_G       = 6;       // 0-5 goles en pantalla
const FIXED_SEED  = 42;
const N_OPTIONS   = [
  { label: '1 000',  value: 1_000  },
  { label: '10 000', value: 10_000 },
  { label: '50 000', value: 50_000 },
];

const eloMap = new Map(crosswalk.map(t => [t.code, t.eloRating]));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toTeamStrength(team) {
  return {
    code:    team.code,
    attack:  Math.max(0.2, (team.avgGF ?? LEAGUE_AVG) / LEAGUE_AVG),
    defense: Math.max(0.2, (team.avgGA ?? LEAGUE_AVG) / LEAGUE_AVG),
    elo:     eloMap.get(team.code) ?? 1500,
    form:    team.form ?? '',
  };
}

function buildAnalyticalMatrix(home, away) {
  const dc  = dixonColesProbs(home, away);
  const lh  = dc.lambdaHome;
  const la  = dc.lambdaAway;
  const mat = Array.from({ length: MAX_G }, (_, h) =>
    Array.from({ length: MAX_G }, (_, a) => poisson(lh, h) * poisson(la, a))
  );
  return { mat, lambdaH: lh, lambdaA: la };
}

function countsToMatrix(counts, nSims) {
  const mat = Array.from({ length: MAX_G }, () => Array(MAX_G).fill(0));
  for (const [key, count] of Object.entries(counts)) {
    const [h, a] = key.split('-').map(Number);
    if (h < MAX_G && a < MAX_G) mat[h][a] = count / nSims;
  }
  return mat;
}

function deriveOutcomes(mat) {
  let home = 0, draw = 0, away = 0;
  for (let h = 0; h < mat.length; h++) {
    for (let a = 0; a < mat[h].length; a++) {
      const p = mat[h][a];
      if      (h > a) home += p;
      else if (h === a) draw += p;
      else              away += p;
    }
  }
  const sum = home + draw + away;
  return sum > 0
    ? { home: home / sum, draw: draw / sum, away: away / sum }
    : { home: 0, draw: 0, away: 0 };
}

function getTopScorelines(mat, n = 10) {
  const flat = [];
  for (let h = 0; h < mat.length; h++) {
    for (let a = 0; a < mat[h].length; a++) {
      flat.push({ score: `${h}-${a}`, p: mat[h][a] });
    }
  }
  return flat.sort((x, y) => y.p - x.p).slice(0, n);
}

function getTopCell(mat) {
  let best = { h: 0, a: 0, p: -1 };
  for (let h = 0; h < mat.length; h++) {
    for (let a = 0; a < mat[h].length; a++) {
      if (mat[h][a] > best.p) best = { h, a, p: mat[h][a] };
    }
  }
  return best;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function MatchAnalysis({ match, onClose }) {
  const [mode,            setMode]            = useState('analytical');
  const [nSims,           setNSims]           = useState(10_000);
  const [mcStatus,        setMcStatus]        = useState('idle');
  const [mcCounts,        setMcCounts]        = useState(null);
  const [mcLambdas,       setMcLambdas]       = useState(null);
  const [showJustif,      setShowJustif]      = useState(false);
  const [isExporting,     setIsExporting]     = useState(false);
  const workerRef  = useRef(null);
  const panelRef   = useRef(null);

  const { home, away } = match;
  const analysis = useMemo(() => analyzeMatch(match), [match]);

  // ── Datos analíticos (síncronos, instantáneos) ──────────────────────
  const analyticalData = useMemo(() => {
    try { return buildAnalyticalMatrix(home, away); }
    catch { return null; }
  }, [home.code, away.code]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lanzar simulación MC cuando mode='mc' o cambia nSims ────────────
  useEffect(() => {
    if (mode !== 'mc') return;

    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setMcStatus('running');
    setMcCounts(null);

    const homeStr = toTeamStrength(home);
    const awayStr = toTeamStrength(away);

    const worker = new Worker(
      new URL('../workers/matchSimWorker.js', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = ({ data }) => {
      if (data.type === 'done') {
        setMcCounts(data.counts);
        setMcLambdas({ h: data.lambdaH, a: data.lambdaA });
        setMcStatus('done');
        worker.terminate();
        workerRef.current = null;
      } else if (data.type === 'error') {
        setMcStatus('error');
        worker.terminate();
        workerRef.current = null;
      }
    };
    worker.onerror = () => {
      setMcStatus('error');
      workerRef.current = null;
    };

    worker.postMessage({ home: homeStr, away: awayStr, nSims, seed: FIXED_SEED });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [mode, nSims, home.code, away.code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Limpiar al desmontar
  useEffect(() => () => workerRef.current?.terminate(), []);

  // Focus y Escape
  useEffect(() => { panelRef.current?.focus(); }, []);
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  // ── Matriz activa según modo ─────────────────────────────────────────
  const mcMatrix = useMemo(
    () => (mcCounts ? countsToMatrix(mcCounts, nSims) : null),
    [mcCounts, nSims],
  );

  const activeMatrix  = mode === 'mc' && mcMatrix ? mcMatrix : analyticalData?.mat;
  const activeLambdaH = mode === 'mc' ? mcLambdas?.h : analyticalData?.lambdaH;
  const activeLambdaA = mode === 'mc' ? mcLambdas?.a : analyticalData?.lambdaA;

  const probs     = useMemo(() => (activeMatrix ? deriveOutcomes(activeMatrix) : null), [activeMatrix]);
  const topScores = useMemo(() => (activeMatrix ? getTopScorelines(activeMatrix) : []),  [activeMatrix]);
  const topCell   = useMemo(() => (activeMatrix ? getTopCell(activeMatrix) : { h: 0, a: 0 }), [activeMatrix]);

  const isLoading = mode === 'mc' && mcStatus === 'running';

  const handleExport = async () => {
    if (isExporting || isLoading || !activeMatrix || !probs) return;
    setIsExporting(true);
    try {
      await exportAnalysis({ match, probs, topScores, matrix: activeMatrix, topCell, mode, nSims, seed: FIXED_SEED });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`Análisis de marcadores: ${home.name} vs ${away.name}`}
    >
      {/* Fondo oscuro */}
      <div
        className="absolute inset-0 bg-zinc-950/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel deslizable desde abajo */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative mt-auto max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl
                   border-t border-zinc-800 bg-zinc-950 outline-none"
      >
        {/* Indicador de arrastre */}
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-zinc-700" aria-hidden="true" />

        {/* Encabezado pegajoso */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b
                        border-zinc-800/80 bg-zinc-950/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl leading-none" role="img" aria-hidden="true">{home.flag}</span>
            <span className="text-sm font-black text-zinc-100">{home.code}</span>
            <span className="text-xs text-zinc-600">vs</span>
            <span className="text-sm font-black text-zinc-100">{away.code}</span>
            <span className="text-xl leading-none" role="img" aria-hidden="true">{away.flag}</span>
            <span className={`chip ml-1 shrink-0 ${isKnockout(match.stage)
              ? 'border border-amber-500/30 bg-amber-500/15 text-amber-300'
              : 'bg-zinc-800/60 text-zinc-400'}`}>
              {stageLabel(match.stage, match.group)}
            </span>
          </div>
          <div className="ml-2 flex shrink-0 items-center gap-1">
            <button
              onClick={handleExport}
              disabled={isExporting || isLoading || !activeMatrix || !probs}
              aria-label="Exportar análisis como imagen"
              title="Exportar análisis como imagen"
              className="rounded-lg p-1.5 text-zinc-500 transition-colors
                         hover:bg-zinc-800 hover:text-emerald-400
                         disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isExporting
                ? <Loader2 size={15} className="animate-spin" />
                : <Share2 size={15} />}
            </button>
            <button
              onClick={onClose}
              aria-label="Cerrar análisis"
              className="rounded-lg p-1.5 text-zinc-500
                         hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4">

          {/* ── Toggle Analítico / Monte Carlo ────────────────────────── */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-zinc-500">Modo:</span>
            <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1">
              <button
                onClick={() => setMode('analytical')}
                aria-pressed={mode === 'analytical'}
                className={[
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors',
                  mode === 'analytical'
                    ? 'bg-brand-violet text-white'
                    : 'text-zinc-500 hover:text-zinc-300',
                ].join(' ')}
              >
                <BarChart2 size={11} aria-hidden="true" />
                Analítico
              </button>
              <button
                onClick={() => setMode('mc')}
                aria-pressed={mode === 'mc'}
                className={[
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors',
                  mode === 'mc'
                    ? 'bg-brand-violet text-white'
                    : 'text-zinc-500 hover:text-zinc-300',
                ].join(' ')}
              >
                <Cpu size={11} aria-hidden="true" />
                Monte Carlo
              </button>
            </div>
          </div>

          {/* ── Controles MC ──────────────────────────────────────────── */}
          {mode === 'mc' && (
            <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">Simulaciones</span>
                <span
                  className="text-[10px] tabular-nums text-zinc-700"
                  title="Seed fija para reproducibilidad"
                >
                  seed: {FIXED_SEED}
                </span>
              </div>

              <div className="flex gap-1.5">
                {N_OPTIONS.map(({ label, value }) => (
                  <button
                    key={value}
                    onClick={() => setNSims(value)}
                    disabled={isLoading}
                    aria-pressed={nSims === value}
                    className={[
                      'flex-1 rounded-lg py-1.5 text-[10px] font-bold transition-colors',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      nSims === value
                        ? 'bg-brand-emerald text-zinc-950'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {nSims === 50_000 && (
                <div className="flex items-start gap-1.5 rounded-lg border border-amber-500/20
                               bg-amber-500/10 px-2.5 py-1.5">
                  <Zap size={11} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
                  <p className="text-[10px] text-amber-300">
                    50 000 sims. pueden tardar ~5–10 s en móvil.
                  </p>
                </div>
              )}

              {mcStatus === 'running' && (
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                  <span
                    className="h-2 w-2 animate-pulse rounded-full bg-brand-emerald"
                    aria-hidden="true"
                  />
                  Simulando {nSims.toLocaleString()} partidos…
                </div>
              )}
              {mcStatus === 'error' && (
                <p className="text-[11px] text-rose-400" role="alert">
                  Error en la simulación. Recargá e intentá de nuevo.
                </p>
              )}
            </div>
          )}

          {/* ── Panel 1: Heatmap ──────────────────────────────────────── */}
          <div className="card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold text-zinc-300">Distribución de marcadores</h3>
              <span className="text-[10px] text-zinc-600">
                {mode === 'analytical'
                  ? 'Poisson bivariado'
                  : isLoading
                  ? 'calculando…'
                  : `${nSims.toLocaleString()} sims.`}
              </span>
            </div>

            {isLoading ? (
              <div className="flex h-44 items-center justify-center rounded-lg bg-zinc-800/40
                             animate-pulse">
                <span className="text-[11px] text-zinc-600">Calculando…</span>
              </div>
            ) : activeMatrix ? (
              <ScorelineHeatmap
                matrix={activeMatrix}
                home={home}
                away={away}
                topH={topCell.h}
                topA={topCell.a}
                lambdaH={activeLambdaH}
                lambdaA={activeLambdaA}
              />
            ) : null}
          </div>

          {/* ── Panel 2: Barras 1X2 ───────────────────────────────────── */}
          <div className="card p-3 space-y-2">
            <h3 className="text-[11px] font-bold text-zinc-300">Resultado 1X2</h3>
            <OutcomeBars
              probs={isLoading ? null : probs}
              home={home}
              away={away}
              loading={isLoading || !probs}
            />
          </div>

          {/* ── Panel 3: Top 10 marcadores ────────────────────────────── */}
          <div className="card p-3 space-y-2">
            <h3 className="text-[11px] font-bold text-zinc-300">Top 10 marcadores exactos</h3>
            {isLoading ? (
              <div className="space-y-1.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-5 animate-pulse rounded bg-zinc-800/60" />
                ))}
              </div>
            ) : (
              <TopScorelines scorelines={topScores} home={home} away={away} />
            )}
          </div>

          {/* ── Fuentes / Justificación ───────────────────────────────── */}
          {analysis && (
            <>
              <button
                onClick={() => setShowJustif(v => !v)}
                aria-expanded={showJustif}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl
                           border border-zinc-800 py-2.5 text-[11px] font-semibold
                           text-zinc-500 transition-colors hover:text-zinc-300"
              >
                {showJustif ? 'Ocultar fuentes del modelo' : 'Ver fuentes e inputs del modelo'}
                <ChevronDown
                  size={12} aria-hidden="true"
                  className={`transition-transform ${showJustif ? 'rotate-180' : ''}`}
                />
              </button>
              {showJustif && (
                <div className="animate-fade-up">
                  <JustificationPanel analysis={analysis} />
                </div>
              )}
            </>
          )}

          {/* ── Disclaimer ────────────────────────────────────────────── */}
          <div className="flex items-start gap-2 rounded-xl border border-zinc-800
                         bg-zinc-900/40 p-3">
            <BookOpen size={12} className="mt-0.5 shrink-0 text-zinc-600" aria-hidden="true" />
            <p className="text-[10px] leading-relaxed text-zinc-600">
              <strong className="text-zinc-500">Uso educativo · +18.</strong>{' '}
              Las probabilidades son estimaciones del modelo Dixon–Coles + Elo.
              No constituyen predicciones garantizadas ni consejos de apuestas.
              Jugá responsablemente.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
