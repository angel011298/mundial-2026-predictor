import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ── Service Worker: registro + actualización automática 24/7 ──────────────────
// iOS Safari no chequea actualizaciones del SW por sí solo (máx. 1 vez/día).
// Solución: llamar reg.update() cada 30 s para detectar nuevos deploys en Vercel.
// Cuando hay SW nuevo: skipWaiting() lo activa → controllerchange → reload.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');

      // Activa el SW en espera de inmediato (sin esperar cierre de pestañas)
      const activatePending = (worker) => {
        if (worker?.state === 'installed' && navigator.serviceWorker.controller) {
          worker.postMessage({ type: 'SKIP_WAITING' });
        }
      };

      // Nuevo SW encontrado durante esta sesión
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w.addEventListener('statechange', () => activatePending(w));
      });

      // SW que ya estaba en espera al cargar la página
      if (reg.waiting) activatePending(reg.waiting);

      // Cuando el nuevo SW toma control → recargar para usar el código fresco
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });

      // Chequear actualizaciones cada 30 s (mismo intervalo que el polling de datos).
      // Cada llamada hace un HEAD request a /sw.js; si cambió byte a byte → instala.
      setInterval(() => reg.update(), 30_000);

    } catch (err) {
      console.warn('[SW] registration failed:', err);
    }
  });
}
