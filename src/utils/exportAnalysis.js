/**
 * exportAnalysis.js — Genera imagen PNG del análisis de partido (canvas nativo, sin deps).
 *
 * Formato vertical 450×860 px @2x (900×1720 retina) — listo para historias/reel.
 * Paleta idéntica a la app: zinc-950 fondo, emerald/violet acentos.
 */

const W = 450, H = 860, SCALE = 2;
const CELL = 50, GRID_N = 6;

// ── Colores (mismos que GoalMatrix / ScorelineHeatmap) ─────────────────────────
function heatColor(t) {
  if (t <= 0) return '#18181b';
  return `rgb(${Math.round(24 - 8 * t)},${Math.round(24 + 161 * t)},${Math.round(27 + 102 * t)})`;
}
function heatText(t) {
  return t > 0.55 ? '#09090b' : t > 0.2 ? '#f4f4f5' : '#52525b';
}

// ── Primitivas canvas ───────────────────────────────────────────────────────────
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

function txt(ctx, str, x, y, font, color, align = 'center') {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.fillText(String(str), x, y);
}

function hLine(ctx, y, color = '#27272a') {
  ctx.fillStyle = color;
  ctx.fillRect(20, y, W - 40, 1);
}

// ── Función principal ───────────────────────────────────────────────────────────
export async function exportAnalysis({
  match, probs, topScores, matrix, topCell, mode, nSims, seed = 42,
}) {
  await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width  = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = 'middle';

  const { home, away } = match;

  // ── Fondo ─────────────────────────────────────────────────────────────────────
  ctx.fillStyle = '#09090b';
  ctx.fillRect(0, 0, W, H);

  // Barra superior gradiente
  const topGrad = ctx.createLinearGradient(0, 0, W, 0);
  topGrad.addColorStop(0, '#10b981');
  topGrad.addColorStop(1, '#8b5cf6');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, 5);

  // ── Logo ──────────────────────────────────────────────────────────────────────
  let y = 26;
  txt(ctx, 'Mundial 2026 · Predictor', W / 2, y, 'bold 12px Inter,system-ui,sans-serif', '#10b981');

  // ── Equipos ───────────────────────────────────────────────────────────────────
  y += 28;
  txt(ctx, home.flag, W / 2 - 84, y, '22px serif', '#f4f4f5');
  txt(ctx, home.code, W / 2 - 84, y + 22, 'bold 22px Inter,system-ui,sans-serif', '#f4f4f5');
  txt(ctx, 'vs', W / 2, y + 11, '11px Inter,system-ui,sans-serif', '#3f3f46');
  txt(ctx, away.flag, W / 2 + 84, y, '22px serif', '#f4f4f5');
  txt(ctx, away.code, W / 2 + 84, y + 22, 'bold 22px Inter,system-ui,sans-serif', '#f4f4f5');

  y += 48;
  // Nombre completo debajo del código
  txt(ctx, home.name, W / 2 - 84, y, '9px Inter,system-ui,sans-serif', '#71717a');
  txt(ctx, away.name, W / 2 + 84, y, '9px Inter,system-ui,sans-serif', '#71717a');

  // ── Chip de modo ─────────────────────────────────────────────────────────────
  y += 16;
  const modeText = mode === 'mc'
    ? `Monte Carlo · ${nSims.toLocaleString()} sims · seed ${seed}`
    : 'Analítico — Poisson bivariado (Dixon-Coles)';
  const chipColor = mode === 'mc' ? '#10b98120' : '#8b5cf620';
  const txtColor  = mode === 'mc' ? '#34d399' : '#a78bfa';
  ctx.save();
  ctx.font = '9px Inter,system-ui,sans-serif';
  const tw = ctx.measureText(modeText).width;
  ctx.restore();
  const chipW = Math.min(tw + 24, W - 40);
  rrect(ctx, (W - chipW) / 2, y - 8, chipW, 17, 9);
  ctx.fillStyle = chipColor;
  ctx.fill();
  txt(ctx, modeText, W / 2, y, '9px Inter,system-ui,sans-serif', txtColor);

  y += 18;
  hLine(ctx, y);
  y += 14;

  // ── Sección 1: Heatmap ────────────────────────────────────────────────────────
  txt(ctx, 'Distribución de marcadores', 20, y, 'bold 11px Inter,system-ui,sans-serif', '#e4e4e7', 'left');
  y += 16;

  const GRID_W = GRID_N * CELL;
  const GRID_X = Math.round((W - GRID_W) / 2);

  // Etiqueta eje X
  txt(ctx, `← Goles ${home.code} →`, GRID_X + GRID_W / 2, y,
      '8px Inter,system-ui,sans-serif', '#3f3f46');
  y += 13;

  // Cabeceras columnas
  for (let c = 0; c < GRID_N; c++) {
    txt(ctx, c, GRID_X + c * CELL + CELL / 2, y, '9px Inter,system-ui,sans-serif', '#71717a');
  }
  y += 11;

  const GRID_Y = y;

  // Etiqueta eje Y (rotada)
  ctx.save();
  ctx.translate(GRID_X - 18, GRID_Y + GRID_W / 2);
  ctx.rotate(-Math.PI / 2);
  txt(ctx, `← Goles ${away.code} →`, 0, 0, '8px Inter,system-ui,sans-serif', '#3f3f46');
  ctx.restore();

  // Cabeceras filas
  for (let r = 0; r < GRID_N; r++) {
    txt(ctx, r, GRID_X - 8, GRID_Y + r * CELL + CELL / 2,
        '9px Inter,system-ui,sans-serif', '#71717a', 'right');
  }

  // Celdas
  const maxP = matrix
    ? Math.max(...matrix.flat().filter(Number.isFinite), 0.001)
    : 0.001;

  for (let col = 0; col < GRID_N; col++) {
    for (let row = 0; row < GRID_N; row++) {
      const p   = matrix?.[col]?.[row] ?? 0;
      const t   = Math.sqrt(p / maxP);
      const isTop = col === topCell.h && row === topCell.a;
      const cx  = GRID_X + col * CELL;
      const cy  = GRID_Y + row * CELL;

      rrect(ctx, cx + 1, cy + 1, CELL - 2, CELL - 2, 4);
      ctx.fillStyle = heatColor(t);
      ctx.fill();

      // Borde
      ctx.strokeStyle = isTop ? '#f59e0b' : '#3f3f46';
      ctx.lineWidth   = isTop ? 2 : 0.5;
      rrect(ctx, cx + 1, cy + 1, CELL - 2, CELL - 2, 4);
      ctx.stroke();
      ctx.lineWidth = 1;

      if (isTop) {
        txt(ctx, '★', cx + CELL / 2, cy + 11, '10px serif', '#f59e0b');
      }

      if (p >= 0.025) {
        txt(ctx, `${(p * 100).toFixed(0)}%`, cx + CELL / 2, cy + CELL / 2 + (isTop ? 6 : 0),
            'bold 9px Inter,system-ui,sans-serif', heatText(t));
      } else if (p >= 0.004) {
        txt(ctx, `${(p * 100).toFixed(1)}`, cx + CELL / 2, cy + CELL / 2,
            '8px Inter,system-ui,sans-serif', heatText(t));
      }
    }
  }

  y = GRID_Y + GRID_N * CELL + 8;
  txt(ctx, `★ Mas probable: ${topCell.h}-${topCell.a}`, GRID_X, y,
      '8px Inter,system-ui,sans-serif', '#52525b', 'left');
  y += 16;
  hLine(ctx, y);
  y += 14;

  // ── Sección 2: Barras 1X2 ─────────────────────────────────────────────────────
  txt(ctx, 'Resultado 1X2', 20, y, 'bold 11px Inter,system-ui,sans-serif', '#e4e4e7', 'left');
  y += 18;

  const bars = [
    { label: home.code, value: probs?.home ?? 0, color: '#10b981' },
    { label: 'X',       value: probs?.draw ?? 0, color: '#71717a' },
    { label: away.code, value: probs?.away ?? 0, color: '#8b5cf6' },
  ];

  const BAR_H = 16, BAR_X = 44, BAR_MAX = W - 102;

  for (const bar of bars) {
    txt(ctx, bar.label, BAR_X - 8, y + BAR_H / 2, 'bold 9px Inter,system-ui,sans-serif', '#a1a1aa', 'right');

    rrect(ctx, BAR_X, y, BAR_MAX, BAR_H, 8);
    ctx.fillStyle = '#27272a';
    ctx.fill();

    const fw = bar.value > 0 ? Math.max(bar.value * BAR_MAX, 16) : 0;
    if (fw > 0) {
      rrect(ctx, BAR_X, y, fw, BAR_H, 8);
      ctx.fillStyle = bar.color;
      ctx.fill();
    }

    txt(ctx, `${(bar.value * 100).toFixed(1)}%`, BAR_X + BAR_MAX + 7, y + BAR_H / 2,
        'bold 9px Inter,system-ui,sans-serif', bar.color, 'left');

    y += BAR_H + 10;
  }

  y += 6;
  hLine(ctx, y);
  y += 14;

  // ── Sección 3: Top 5 marcadores ───────────────────────────────────────────────
  txt(ctx, 'Top 5 marcadores exactos', 20, y, 'bold 11px Inter,system-ui,sans-serif', '#e4e4e7', 'left');
  y += 18;

  const top5  = (topScores ?? []).slice(0, 5);
  const maxTP = top5[0]?.p ?? 0.001;
  const SC_X  = 58, SC_MAX = W - 122;

  for (let i = 0; i < top5.length; i++) {
    const { score, p } = top5[i];
    const [gh, ga]     = score.split('-').map(Number);
    const outcome      = gh > ga ? home.code : gh < ga ? away.code : 'X';
    const outColor     = gh > ga ? '#10b981' : gh < ga ? '#8b5cf6' : '#71717a';

    txt(ctx, i + 1, 22, y + 10, '9px Inter,system-ui,sans-serif', '#3f3f46', 'right');
    txt(ctx, score,  47, y + 10, 'bold 11px Inter,system-ui,sans-serif', '#f4f4f5', 'center');

    rrect(ctx, SC_X, y + 4, SC_MAX, 10, 5);
    ctx.fillStyle = '#27272a';
    ctx.fill();

    const sw = Math.max((p / maxTP) * SC_MAX, 10);
    rrect(ctx, SC_X, y + 4, sw, 10, 5);
    ctx.fillStyle = '#10b981';
    ctx.fill();

    txt(ctx, `${(p * 100).toFixed(2)}%`, SC_X + SC_MAX + 5, y + 10,
        'bold 9px Inter,system-ui,sans-serif', '#10b981', 'left');
    txt(ctx, outcome, SC_X + SC_MAX + 42, y + 10,
        'bold 9px Inter,system-ui,sans-serif', outColor, 'left');

    y += 24;
  }

  y += 8;
  hLine(ctx, y);
  y += 14;

  // ── Footer ────────────────────────────────────────────────────────────────────
  txt(ctx, 'Uso educativo · +18 · No constituye consejo de apuestas · Jugá responsablemente',
      W / 2, y, '8px Inter,system-ui,sans-serif', '#3f3f46');
  y += 14;
  txt(ctx, 'mundial-2026-predictor.vercel.app',
      W / 2, y, 'bold 9px Inter,system-ui,sans-serif', '#27272a');

  // Barra inferior gradiente
  const botGrad = ctx.createLinearGradient(0, 0, W, 0);
  botGrad.addColorStop(0, '#10b981');
  botGrad.addColorStop(1, '#8b5cf6');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, H - 4, W, 4);

  // ── Descarga ──────────────────────────────────────────────────────────────────
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `${home.code}_vs_${away.code}_mundial2026.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      resolve();
    }, 'image/png');
  });
}
