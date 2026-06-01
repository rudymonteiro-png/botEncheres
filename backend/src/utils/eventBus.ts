import { EventEmitter } from 'node:events';
import type { BotState, ActionLog } from '../types/domain.js';

/**
 * Bus d'evenements interne : le moteur emet, le serveur WebSocket relaie.
 */

export interface BotEvents {
  state: (state: BotState) => void;
  action: (action: ActionLog) => void;
  log: (entry: { level: string; message: string; ts: string }) => void;
}

class TypedEventBus extends EventEmitter {
  emitState(state: BotState): void {
    this.emit('state', state);
  }
  emitAction(action: ActionLog): void {
    this.emit('action', action);
  }
  emitLog(entry: { level: string; message: string; ts: string }): void {
    this.emit('log', entry);
  }
}

export const eventBus = new TypedEventBus();
