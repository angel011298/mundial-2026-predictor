import { useMemo } from 'react';
import { dixonColesProbs, poisson } from '../model/dixonColes.js';

const MAX_DISPLAY = 6; // goals 0-5

// Zinc-900 (#18181b) → Emerald (#10b981) interpolation
function cellBg(t) {
  if (t <= 0) return '#18181b';
  const r = Math.round(24  + t * (16  - 24));
  const g = Math.round(24  + t * (185 - 24));
  const b = Math.round(27  + t * (129 - 27));
  return `rgb(${r},${g},${b})`;
}
function cellFg(t) {
  return t > 0.55 ? '#09090b' : t > 0.2 ? '#f4f4f5' : '#71717a';
}

const W = 232, H = 196;
const ML = 26, MT = 22, CELL_W = 34, CELL_H = 28;

function sx(col) { return ML + col * CELL_W; }
function sy(row) { return MT + row * CELL_H; }

/**
 * Heatmap SVG de la matriz de marcadores Dixon-Coles.
 * Columnas = goles local, filas = goles visitante.
 * Color: zinc-900 → emerald según la probabilidad relativa al máximo.
 */
export default function GoalMatrix({ home, away }) {
  const data = useMemo(() => {
    try {
      const dc = dixonColesProbs(home, away);
      const lh = dc.lambdaHome;
      const la = dc.lambdaAway;
      const mat = Array.from({ length: MAX_DISPLAY }, (_, h) =>
        Array.from({ length: MAX_DISPLAY }, (_, a) => poisson(lh, h) * poisson(la, a)),
      );
      const maxP = Math.max(...mat.flat());
      const [topH, topA] = dc.topScore.split('-').map(Number);
      return { mat, maxP, lh, la, topH, topA, topScore: dc.topScore };
    } catch { return null; }
  }, [home, away]);

  if (!data) return null;
  const { mat, maxP, lh, la, topH, topA, topScore } = data;

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800/60 px-3 py-2">
        <span className="text-[11px] font-semibold text-zinc-300">Matriz de marcadores probable</span>
        <span className="text-[10px] text-zinc-600 tabular-nums">
          λ{home?.code}={lh.toFixed(2)} · λ{away?.code}={la.toFixed(2)}
        </span>
      </div>

      <div className="overflow-x-auto px-2 py-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ minWidth: W * 0.8, maxWidth: W }}
          role="img"
          aria-label={`Matriz de probabilidad de marcadores. Resultado más probable: ${topScore}.`}
          className="block"
        >
          {/* Axis titles */}
          <text x={ML + (MAX_DISPLAY * CELL_W) / 2} y={11} textAnchor="middle"
                fill="#71717a" fontSize="8.5" fontWeight="600">
            Goles {home?.code ?? 'Local'} →
          </text>
          <text
            x={9}
            y={MT + (MAX_DISPLAY * CELL_H) / 2}
            textAnchor="middle"
            fill="#71717a"
            fontSize="8.5"
            fontWeight="600"
            transform={`rotate(-90 9 ${MT + (MAX_DISPLAY * CELL_H) / 2})`}
          >
            Goles {away?.code ?? 'Visita'} →
          </text>

          {/* Column headers (home goals 0-5) */}
          {Array.from({ length: MAX_DISPLAY }, (_, col) => (
            <text key={`ch-${col}`} x={sx(col) + CELL_W / 2} y={MT - 5}
                  textAnchor="middle" fill="#a1a1aa" fontSize="8.5">{col}</text>
          ))}

          {/* Row headers (away goals 0-5) */}
          {Array.from({ length: MAX_DISPLAY }, (_, row) => (
            <text key={`rh-${row}`} x={ML - 4} y={sy(row) + CELL_H / 2 + 3}
                  textAnchor="end" fill="#a1a1aa" fontSize="8.5">{row}</text>
          ))}

          {/* Cells: col=home goals, row=away goals */}
          {Array.from({ length: MAX_DISPLAY }, (_, col) =>
            Array.from({ length: MAX_DISPLAY }, (_, row) => {
              const p  = mat[col][row];
              const t  = maxP > 0 ? Math.pow(p / maxP, 0.5) : 0;
              const isTop = col === topH && row === topA;
              const x  = sx(col), y = sy(row);
              const pctTxt = p >= 0.025 ? `${(p * 100).toFixed(0)}%` : null;
              return (
                <g key={`${col}-${row}`} role="gridcell" aria-label={`${col}-${row}: ${(p*100).toFixed(1)}%`}>
                  <rect x={x+0.5} y={y+0.5} width={CELL_W-1} height={CELL_H-1} rx="3"
                        fill={cellBg(t)}
                        stroke={isTop ? '#f59e0b' : '#27272a'}
                        strokeWidth={isTop ? 1.5 : 0.5} />
                  {isTop && (
                    <text x={x + CELL_W/2} y={y + 9} textAnchor="middle"
                          fill="#f59e0b" fontSize="7">★</text>
                  )}
                  {pctTxt && (
                    <text x={x + CELL_W/2} y={y + CELL_H/2 + (isTop ? 5 : 3)}
                          textAnchor="middle" fill={cellFg(t)} fontSize="8" fontWeight="700">
                      {pctTxt}
                    </text>
                  )}
                </g>
              );
            })
          )}

          {/* Footer legend */}
          <text x={ML} y={H - 3} fill="#52525b" fontSize="7.5">
            ★ Más probable: {topScore}
          </text>
          <text x={W - 2} y={H - 3} textAnchor="end" fill="#3f3f46" fontSize="7">
            Poisson bivariado
          </text>
        </svg>
      </div>
    </div>
  );
}
