import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { eventBus } from '../utils/eventBus.js';
import { botEngine } from '../bot/engine.js';
import { logger } from '../utils/logger.js';

/**
 * Serveur WebSocket : pousse l'etat du bot et les actions en temps reel au dashboard.
 * Messages : { type: 'state' | 'action', payload }
 */

export function attachWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    logger.debug('Client WebSocket connecte', { clients: wss.clients.size });
    // Envoi de l'etat initial immediatement
    ws.send(JSON.stringify({ type: 'state', payload: botEngine.getState() }));

    ws.on('close', () => {
      logger.debug('Client WebSocket deconnecte', { clients: wss.clients.size });
    });
    ws.on('error', (err) => {
      logger.warn('Erreur WebSocket client', { error: err.message });
    });
  });

  const broadcast = (type: string, payload: unknown): void => {
    const message = JSON.stringify({ type, payload });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };

  eventBus.on('state', (state) => broadcast('state', state));
  eventBus.on('action', (action) => broadcast('action', action));

  logger.info('Serveur WebSocket attache sur /ws');
}
