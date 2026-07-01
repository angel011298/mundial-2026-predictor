import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs   from 'node:fs';
import path from 'node:path';

/**
 * Plugin que reemplaza '__CACHE_VERSION__' en dist/sw.js con un hash
 * derivado del index.html generado (que contiene los nombres de assets
 * con content-hash de Vite). Así cada deploy produce un SW distinto,
 * forzando a iOS Safari a detectar la actualización.
 */
function injectSwVersion() {
  return {
    name: 'inject-sw-version',
    apply: 'build',
    writeBundle(options) {
      const outDir  = options.dir ?? 'dist';
      const swPath  = path.resolve(outDir, 'sw.js');
      const htmlPath = path.resolve(outDir, 'index.html');

      if (!fs.existsSync(swPath)) return;

      // Hash derivado del index.html (contiene los nombres hashed de JS/CSS)
      let version;
      if (fs.existsSync(htmlPath)) {
        const html = fs.readFileSync(htmlPath, 'utf8');
        let h = 0;
        for (const c of html) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
        version = (h >>> 0).toString(36);
      } else {
        version = Date.now().toString(36);
      }

      const sw = fs.readFileSync(swPath, 'utf8');
      fs.writeFileSync(swPath, sw.replace('__CACHE_VERSION__', version), 'utf8');
      console.log(`\n[sw] CACHE_VERSION → wc26-${version}\n`);
    },
  };
}

// Sello de compilación visible en la UI (footer) — permite confirmar de un
// vistazo qué versión está sirviendo producción y detectar caché obsoleta.
const BUILD_STAMP = new Date().toLocaleString('es-MX', {
  timeZone: 'America/Mexico_City',
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

export default defineConfig({
  plugins: [react(), injectSwVersion()],
  define: {
    __BUILD_STAMP__: JSON.stringify(BUILD_STAMP),
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
