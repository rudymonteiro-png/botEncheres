import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy /api et /ws vers le backend local (HOST:PORT du backend, defaut 4000).
const BACKEND = process.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    // Host configurable : 127.0.0.1 par defaut (usage local).
    // Mettre VITE_HOST=0.0.0.0 pour exposer (ex: tunnel/sandbox de demo).
    host: process.env.VITE_HOST ?? '127.0.0.1',
    port: 5173,
    // Autorise les hotes externes (sandbox de demo derriere proxy).
    allowedHosts: true,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/ws': { target: BACKEND, ws: true, changeOrigin: true },
    },
  },
});
