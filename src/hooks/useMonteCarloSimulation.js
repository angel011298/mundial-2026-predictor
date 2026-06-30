import { useState, useCallback, useEffect, useRef } from 'react';
import worldcup from '../data/worldcup2026.json';
import crosswalk from '../data/team-crosswalk.json';

const LEAGUE_AVG = 1.32;
const CACHE_KEY  = 'mc_sim_v1';

const eloMap = new Map(crosswalk.map(t => [t.code, t.eloRating]));

function buildSimGroups() {
  return worldcup.groups.map(g => ({
    id:    g.id,
    teams: g.teams.map(t => ({
      code:    t.code,
      name:    t.name,
      flag:    t.flag,
      attack:  t.avgGF / LEAGUE_AVG,
      defense: t.avgGA / LEAGUE_AVG,
      elo:     eloMap.get(t.code) ?? 1500,
      form:    t.form ?? '',
    })),
  }));
}

export function useMonteCarloSimulation() {
  const [status,   setStatus]   = useState('idle');   // 'idle' | 'running' | 'done' | 'error'
  const [progress, setProgress] = useState(0);          // 0 – 1
  const [results,  setResults]  = useState(null);       // TeamResult[] ordenado por pChampion desc
  const [meta,     setMeta]     = useState(null);       // { nIterations, ts }
  const workerRef = useRef(null);

  // Cargar caché al montar
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const cached = JSON.parse(raw);
      if (Array.isArray(cached?.results) && cached.results.length > 0) {
        setResults(cached.results);
        setMeta({ nIterations: cached.nIterations, ts: cached.ts });
        setStatus('done');
        setProgress(1);
      }
    } catch {
      // cache corrupta → ignorar
    }
  }, []);

  const run = useCallback((nIterations, seed = 42) => {
    // Terminar worker anterior si está corriendo
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }

    setStatus('running');
    setProgress(0);
    setResults(null);
    setMeta(null);

    const groups = buildSimGroups();

    const worker = new Worker(
      new URL('../workers/tournamentWorker.js', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = ({ data }) => {
      switch (data.type) {
        case 'progress':
          setProgress(data.done / data.total);
          break;

        case 'done': {
          const sorted = Object.values(data.results)
            .sort((a, b) => b.pChampion - a.pChampion);
          const ts = Date.now();
          setResults(sorted);
          setMeta({ nIterations, ts });
          setStatus('done');
          setProgress(1);
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ nIterations, ts, results: sorted }));
          } catch {
            // quota exceeded → ignorar
          }
          worker.terminate();
          workerRef.current = null;
          break;
        }

        case 'error':
          setStatus('error');
          worker.terminate();
          workerRef.current = null;
          break;
      }
    };

    worker.onerror = () => {
      setStatus('error');
      workerRef.current = null;
    };

    worker.postMessage({ groups, nIterations, seed });
  }, []);

  const cancel = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setStatus('idle');
    setProgress(0);
  }, []);

  // Limpiar al desmontar
  useEffect(() => () => workerRef.current?.terminate(), []);

  return { status, progress, results, meta, run, cancel };
}
