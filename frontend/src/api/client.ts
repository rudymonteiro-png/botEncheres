import type {
  BotState,
  TargetPlayer,
  BlacklistedUser,
  BotSettings,
  ActionLog,
  AuthStatus,
} from './types';

/** Client REST vers le backend local (proxy unique vers Sorare). */

const BASE = '/api';

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      /* noop */
    }
    throw new Error(`HTTP ${res.status} ${path} ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // Etat & controle
  getState: () => req<BotState>('/state'),
  startBot: () => req<BotState>('/bot/start', { method: 'POST' }),
  pauseBot: () => req<BotState>('/bot/pause', { method: 'POST' }),
  stopBot: () => req<BotState>('/bot/stop', { method: 'POST' }),
  loadDemo: () => req<BotState>('/demo/load', { method: 'POST' }),

  // Auth
  authStatus: () => req<AuthStatus>('/auth/status'),
  signIn: () =>
    req<{ ok: boolean; otpRequired?: boolean; error?: string; state: AuthStatus }>(
      '/auth/signin',
      { method: 'POST' }
    ),
  submitOtp: (otp: string) =>
    req<{ ok: boolean; error?: string; state: AuthStatus }>('/auth/otp', {
      method: 'POST',
      body: JSON.stringify({ otp }),
    }),

  // Cibles
  listTargets: () => req<TargetPlayer[]>('/targets'),
  createTarget: (t: {
    playerSlug: string;
    displayName: string;
    maxPriceCents: number;
    enabled: boolean;
  }) => req<TargetPlayer>('/targets', { method: 'POST', body: JSON.stringify(t) }),
  updateTarget: (
    id: number,
    t: Partial<{ displayName: string; maxPriceCents: number; enabled: boolean }>
  ) => req<TargetPlayer>(`/targets/${id}`, { method: 'PATCH', body: JSON.stringify(t) }),
  deleteTarget: (id: number) => req<void>(`/targets/${id}`, { method: 'DELETE' }),

  // Blacklist
  listBlacklist: () => req<BlacklistedUser[]>('/blacklist'),
  createBlacklist: (b: { userSlug: string; note: string | null }) =>
    req<BlacklistedUser>('/blacklist', { method: 'POST', body: JSON.stringify(b) }),
  deleteBlacklist: (id: number) => req<void>(`/blacklist/${id}`, { method: 'DELETE' }),

  // Settings
  getSettings: () => req<BotSettings>('/settings'),
  updateSettings: (s: Partial<BotSettings>) =>
    req<BotSettings>('/settings', { method: 'PATCH', body: JSON.stringify(s) }),

  // Historique
  getHistory: (limit = 200, offset = 0) =>
    req<{ total: number; items: ActionLog[] }>(`/history?limit=${limit}&offset=${offset}`),
};
