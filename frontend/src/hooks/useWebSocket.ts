import { useEffect, useRef, useState, useCallback } from 'react';
import type { BotState, ActionLog } from '../api/types';

/**
 * Hook WebSocket : recoit l'etat du bot et les nouvelles actions en temps reel.
 * Reconnexion automatique avec backoff.
 */

interface WsMessage {
  type: 'state' | 'action';
  payload: BotState | ActionLog;
}

export function useWebSocket(onAction: (a: ActionLog) => void) {
  const [state, setState] = useState<BotState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  const connect = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${window.location.host}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryRef.current = 0;
    };
    ws.onclose = () => {
      setConnected(false);
      const delay = Math.min(10000, 1000 * 2 ** retryRef.current);
      retryRef.current += 1;
      setTimeout(connect, delay);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WsMessage;
        if (msg.type === 'state') setState(msg.payload as BotState);
        else if (msg.type === 'action') onActionRef.current(msg.payload as ActionLog);
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { state, connected };
}
