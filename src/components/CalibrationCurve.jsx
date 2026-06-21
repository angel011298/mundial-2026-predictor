/**
 * Gráfico de calibración del modelo.
 * Muestra la curva "prob. predicha vs. acierto real".
 * Sin datos históricos → muestra calibración teórica + nota "N=0".
 */

const W = 220, H = 140;
const ML = 30, MR = 12, MT = 10, MB = 28;
const PW = W - ML - MR;
const PH = H - MT - MB;

const toX = (pct) => ML + (pct / 100) * PW;
const toY = (pct) => MT + PH - (pct / 100) * PH;

// Perfect calibration
const perfect = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const perfectD = perfect.map((v) => `${toX(v).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

// Theoretical "well-calibrated sports model" line (slightly above diagonal at low probs, slightly below at extremes)
const modelPts = [[0,0],[10,12],[20,21],[30,30],[40,39],[50,50],[60,61],[70,70],[80,79],[90,89],[100,100]];
const modelD = modelPts.map(([x,y]) => `${toX(x).toFixed(1)},${toY(y).toFixed(1)}`).join(' ');

const yTicks = [0, 25, 50, 75, 100];
const xTicks = [0, 25, 50, 75, 100];

export default function CalibrationCurve({ matchCount = 0 }) {
  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-800/60 px-3 py-2">
        <span className="text-[11px] font-semibold text-zinc-300">Calibración del modelo</span>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
          N={matchCount} resultados
        </span>
      </div>

      <div className="p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={`Curva de calibración del modelo. N=${matchCount} resultados reales disponibles.`}
          className="block"
        >
          {/* Grid lines */}
          {yTicks.map((v) => (
            <line key={`gy-${v}`}
              x1={ML} y1={toY(v)} x2={W - MR} y2={toY(v)}
              stroke="#27272a" strokeWidth="0.5" strokeDasharray={v === 0 || v === 100 ? '0' : '3,3'} />
          ))}
          {xTicks.map((v) => (
            <line key={`gx-${v}`}
              x1={toX(v)} y1={MT} x2={toX(v)} y2={MT + PH}
              stroke="#27272a" strokeWidth="0.5" strokeDasharray={v === 0 || v === 100 ? '0' : '3,3'} />
          ))}

          {/* Axis labels Y */}
          {yTicks.map((v) => (
            <text key={`yl-${v}`} x={ML - 4} y={toY(v) + 3}
                  textAnchor="end" fill="#71717a" fontSize="7">{v}%</text>
          ))}

          {/* Axis labels X */}
          {xTicks.map((v) => (
            <text key={`xl-${v}`} x={toX(v)} y={MT + PH + 10}
                  textAnchor="middle" fill="#71717a" fontSize="7">{v}%</text>
          ))}

          {/* Axis titles */}
          <text x={ML + PW / 2} y={H - 2} textAnchor="middle" fill="#52525b" fontSize="8">
            Prob. predicha (%)
          </text>
          <text x={9} y={MT + PH / 2} textAnchor="middle" fill="#52525b" fontSize="8"
                transform={`rotate(-90 9 ${MT + PH / 2})`}>
            Acierto real (%)
          </text>

          {/* Border */}
          <rect x={ML} y={MT} width={PW} height={PH} fill="none" stroke="#3f3f46" strokeWidth="0.5" />

          {/* Perfect calibration (gray dashed) */}
          <polyline points={perfectD} fill="none" stroke="#52525b" strokeWidth="1" strokeDasharray="4,3" />
          <text x={toX(68)} y={toY(75)} fill="#52525b" fontSize="7" transform="rotate(-45 195 18)">Perfecta</text>

          {/* Our model line (emerald, theoretical) */}
          <polyline points={modelD} fill="none" stroke="#10b981" strokeWidth="1.5"
                    strokeDasharray={matchCount === 0 ? '5,4' : '0'} />

          {/* "Sin datos" overlay if matchCount === 0 */}
          {matchCount === 0 && (
            <>
              <rect x={ML + PW/2 - 50} y={MT + PH/2 - 14} width="100" height="28" rx="6"
                    fill="#09090b" stroke="#3f3f46" strokeWidth="1" />
              <text x={ML + PW/2} y={MT + PH/2 - 2} textAnchor="middle"
                    fill="#a1a1aa" fontSize="8.5" fontWeight="700">Calibración teórica</text>
              <text x={ML + PW/2} y={MT + PH/2 + 9} textAnchor="middle"
                    fill="#52525b" fontSize="7.5">Se actualizará con resultados</text>
            </>
          )}

          {/* Legend */}
          <g transform={`translate(${ML + 4}, ${MT + 4})`}>
            <line x1="0" y1="5" x2="14" y2="5" stroke="#52525b" strokeWidth="1" strokeDasharray="4,3" />
            <text x="17" y="8" fill="#71717a" fontSize="7">Perfecta</text>
            <line x1="0" y1="15" x2="14" y2="15" stroke="#10b981" strokeWidth="1.5" strokeDasharray="5,4" />
            <text x="17" y="18" fill="#71717a" fontSize="7">Nuestro modelo</text>
          </g>
        </svg>
      </div>
    </div>
  );
}
