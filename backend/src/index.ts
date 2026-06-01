import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { config, hasSorareCredentials, hasStarkKey } from './utils/config.js';
import { logger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './db/database.js';
import { router } from './api/routes.js';
import { attachWebSocket } from './ws/server.js';
import { sorareAuth } from './sorare/auth.js';
import { botEngine } from './bot/engine.js';

/**
 * Point d'entree du backend.
 * - Sert l'API REST + WebSocket pour le frontend (proxy unique vers Sorare).
 * - N'ecoute QUE sur HOST (127.0.0.1 par defaut) : usage local sans login.
 *   Configurable via .env pour un VPS (mettre HOST=0.0.0.0 + reverse-proxy).
 */

async function main(): Promise<void> {
  initDatabase();

  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // CORS frontend <-> backend (dev local). Sorare est proxifie cote serveur,
  // donc AUCUN CORS navigateur vers Sorare.
  app.use(
    cors({
      origin: config.corsOrigin,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    })
  );

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'sorare-bid-bot',
      dryRunDefault: config.bot.dryRun,
      hasCredentials: hasSorareCredentials(),
      starkKeyLoaded: hasStarkKey(),
    });
  });

  app.use('/api', router);

  const server = createServer(app);
  attachWebSocket(server);

  server.listen(config.port, config.host, () => {
    logger.info('Backend demarre', {
      url: `http://${config.host}:${config.port}`,
      dryRun: config.bot.dryRun,
      starkKeyLoaded: hasStarkKey(),
      hasCredentials: hasSorareCredentials(),
    });
    if (!hasSorareCredentials()) {
      logger.warn('Identifiants Sorare absents : renseignez .env pour authentifier le bot.');
    }
    if (!hasStarkKey()) {
      logger.warn('Cle Starkware absente : mode lecture/dry-run uniquement (aucune enchere reelle).');
    }
  });

  // Tentative d'authentification au demarrage (non bloquante).
  if (hasSorareCredentials()) {
    void sorareAuth.signIn().then((r) => {
      if (r.otpRequired) {
        logger.warn('2FA requise : fournissez le code OTP via le dashboard (/auth/otp).');
      }
    });
  }

  // Arret propre
  const shutdown = (): void => {
    logger.info('Arret du serveur...');
    botEngine.stop();
    server.close();
    closeDatabase();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('Echec demarrage backend', {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
