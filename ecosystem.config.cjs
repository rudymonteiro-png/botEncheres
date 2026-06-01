// Config PM2 pour usage LOCAL/VPS (pas Cloudflare).
// Demarre le backend Node.js (moteur du bot + API + WebSocket).
// Le frontend se lance separement via `npm run dev:frontend` (Vite) en dev,
// ou se build statiquement (`npm run build:frontend`) pour la prod.
module.exports = {
  apps: [
    {
      name: 'sorare-bot-backend',
      cwd: './backend',
      script: 'dist/index.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
