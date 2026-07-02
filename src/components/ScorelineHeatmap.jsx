import { useState } from 'react';
import { X } from 'lucide-react';

const MAX_G = 6; // goles 0-5 en pantalla

// Path de una estrella de 5 puntas centrada en (0,0), ~8 unidades de diámetro.
// Vectorial propio en vez del glyph ★ (evita depender de la fuente de emoji del SO).
const STAR_PATH = 'M0,-4 L0.94,-1.29 L3.8,-1.24 L1.52,0.49 L2.35,3.24 L0,1.6 L-2.35,3.24 L-1.52,0.49 L-3.8,-1.24 L-0.94,-1.29 Z';

// Zinc-900 → Emerald interpolation (igual que GoalMatrix.jsx)
function cellBg(t) {
  if (t <= 0) return '#18181b';
  const r = Math.round(24 + t * (16  - 24));
  const g = Math.round(24 + t * (185 - 24));
  const b = Math.round(27 + t * (129 - 27));
  return `rgb(${r},${g},${b})`;
}
function cellFg(t) {
  return t > 0.55 ? '#09090b' : t > 0.2 ? '#f4f4f5' : '#71717a';
}

// Layout
const ML = 22, MT = 18, CW = 37, CH = 30;
const SVG_W = ML + MAX_G * CW + 4;
const SVG_H = MT + MAX_G * CH + 16;

export default function ScorelineHeatmap({ matrix, home, away, topH, topA, lambdaH, lambdaA }) {
  const [sel, setSel] = useState(null); // { h, a, p } | null

  if (!matrix) return null;

  const maxP = Math.max(...matrix.flat().filter(Number.isFinite));

  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          width="100%"
          style={{ minWidth: SVG_W * 0.85, maxWidth: SVG_W * 1.1 }}
          role="grid"
          aria-label={`Heatmap de marcadores. Columnas = goles ${home.code}, filas = goles ${away.code}.`}
          className="block"
        >
          {/* Eje X: goles local */}
          <text
            x={ML + (MAX_G * CW) / 2} y={10}
            textAnchor="middle" fill="#71717a" fontSize="8" fontWeight="600"
          >
            Goles {home.code} →
          </text>

          {/* Eje Y: goles visitante */}
          <text
            x={8} y={MT + (MAX_G * CH) / 2}
            textAnchor="middle" fill="#71717a" fontSize="8" fontWeight="600"
            transform={`rotate(-90 8 ${MT + (MAX_G * CH) / 2})`}
          >
            Goles {away.code} →
          </text>

          {/* Cabeceras de columna */}
          {Array.from({ length: MAX_G }, (_, col) => (
            <text
              key={`ch-${col}`}
              x={ML + col * CW + CW / 2} y={MT - 5}
              textAnchor="middle" fill="#a1a1aa" fontSize="8"
            >
              {col}
            </text>
          ))}

          {/* Cabeceras de fila */}
          {Array.from({ length: MAX_G }, (_, row) => (
            <text
              key={`rh-${row}`}
              x={ML - 5} y={MT + row * CH + CH / 2 + 3}
              textAnchor="end" fill="#a1a1aa" fontSize="8"
            >
              {row}
            </text>
          ))}

          {/* Celdas: col = goles local, row = goles visitante */}
          {Array.from({ length: MAX_G }, (_, col) =>
            Array.from({ length: MAX_G }, (_, row) => {
              const p     = matrix[col]?.[row] ?? 0;
              const t     = maxP > 0 ? Math.pow(p / maxP, 0.5) : 0;
              const isTop = col === topH && row === topA;
              const isSel = sel?.h === col && sel?.a === row;
              const x = ML + col * CW;
              const y = MT + row * CH;
              const pctTxt = p >= 0.025
                ? `${(p * 100).toFixed(0)}%`
                : p >= 0.004
                ? `${(p * 100).toFixed(1)}`
                : null;

              return (
                <g
                  key={`${col}-${row}`}
                  role="gridcell"
                  aria-label={`${col}-${row}: ${(p * 100).toFixed(2)}%`}
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSel(isSel ? null : { h: col, a: row, p })}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') &&
                    setSel(isSel ? null : { h: col, a: row, p })}
                >
                  <rect
                    x={x + 0.5} y={y + 0.5}
                    width={CW - 1} height={CH - 1} rx="3"
                    fill={isSel ? '#5b21b6' : cellBg(t)}
                    stroke={isTop ? '#f59e0b' : isSel ? '#a78bfa' : '#27272a'}
                    strokeWidth={isTop || isSel ? 1.5 : 0.5}
                  />
                  {isTop && (
                    <path d={STAR_PATH} fill="#f59e0b" transform={`translate(${x + CW / 2},${y + 6}) scale(0.85)`} />
                  )}
                  {pctTxt && (
                    <text
                      x={x + CW / 2} y={y + CH / 2 + (isTop ? 5 : 3)}
                      textAnchor="middle"
                      fill={isSel ? '#e9d5ff' : cellFg(t)}
                      fontSize="7.5" fontWeight="700"
                    >
                      {pctTxt}
                    </text>
                  )}
                </g>
              );
            })
          )}

          {/* Pie de leyenda */}
          <path d={STAR_PATH} fill="#f59e0b" transform={`translate(${ML + 3},${SVG_H - 6}) scale(0.55)`} />
          <text x={ML + 9} y={SVG_H - 3} fill="#52525b" fontSize="7">
            Más probable: {topH}-{topA}
          </text>
          {lambdaH != null && lambdaA != null && (
            <text x={SVG_W - 2} y={SVG_H - 3} textAnchor="end" fill="#3f3f46" fontSize="7">
              λ{home.code}={lambdaH.toFixed(2)} · λ{away.code}={lambdaA.toFixed(2)}
            </text>
          )}
        </svg>
      </div>

      {/* Tooltip de celda seleccionada */}
      {sel && (
        <div
          className="mt-2 flex items-center gap-3 rounded-lg border border-zinc-800
                     bg-zinc-900/80 px-3 py-2 animate-fade-up"
          role="status"
          aria-live="polite"
        >
          <span className="text-base font-black tabular-nums text-zinc-100">
            {sel.h}–{sel.a}
          </span>
          <span className="text-sm font-bold tabular-nums text-brand-emerald">
            {(sel.p * 100).toFixed(2)}%
          </span>
          <span className="flex-1 text-[11px] text-zinc-500">
            {sel.h > sel.a
              ? `Victoria ${home.code}`
              : sel.h < sel.a
              ? `Victoria ${away.code}`
              : 'Empate'}
          </span>
          <button
            onClick={() => setSel(null)}
            aria-label="Cerrar detalle"
            className="text-zinc-700 hover:text-zinc-400 transition-colors"
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
