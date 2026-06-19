import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // SPA estática: el build genera /dist listo para Vercel o Netlify.
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
  },
  server: {
    port: 5173,
    host: true, // permite abrir desde el móvil en la misma red (http://<tu-ip>:5173)
  },
});
