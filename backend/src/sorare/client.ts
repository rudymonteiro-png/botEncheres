import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { sorareAuth } from './auth.js';

/**
 * Client GraphQL Sorare : PROXY UNIQUE vers l'API.
 * Le frontend ne contacte jamais Sorare directement (zero CORS navigateur).
 *
 * - Respect du rate limit (file d'attente avec intervalle minimal + 429/Retry-After)
 * - Retries avec backoff exponentiel + jitter
 */

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export class RateLimiter {
  private lastCall = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(private minIntervalMs: number) {}

  /** Serialise et espace les appels d'au moins minIntervalMs. */
  async acquire(): Promise<void> {
    const run = this.queue.then(async () => {
      const now = Date.now();
      const wait = Math.max(0, this.lastCall + this.minIntervalMs - now);
      if (wait > 0) await sleep(wait);
      this.lastCall = Date.now();
    });
    // On garde la chaine mais on n'echoue jamais la file
    this.queue = run.catch(() => undefined);
    return run;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const MAX_RETRIES = 4;

export class SorareClient {
  // Avec APIKEY : 600/min -> 100ms. Sans : 60/min -> ~1100ms de marge.
  private limiter = new RateLimiter(config.sorare.apiKey ? 110 : 1100);

  /**
   * Execute une requete GraphQL authentifiee.
   * @param query  document GraphQL
   * @param variables variables
   * @param requireAuth si true, garantit un JWT valide avant l'appel
   */
  async request<T>(
    query: string,
    variables: Record<string, unknown> = {},
    requireAuth = true
  ): Promise<T> {
    if (requireAuth) {
      const ok = await sorareAuth.ensureAuthenticated();
      if (!ok) throw new Error('Non authentifie aupres de Sorare');
    }

    let attempt = 0;
    // boucle de retry
    for (;;) {
      await this.limiter.acquire();
      try {
        const res = await fetch(config.sorare.graphqlUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(requireAuth ? sorareAuth.getAuthHeaders() : {}),
            ...(config.sorare.apiKey ? { APIKEY: config.sorare.apiKey } : {}),
          },
          body: JSON.stringify({ query, variables }),
        });

        // Rate limit : respecter Retry-After
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('Retry-After') ?? '2');
          const waitMs = Math.max(1000, retryAfter * 1000);
          logger.warn('Rate limit 429, attente', { waitMs });
          if (attempt >= MAX_RETRIES) throw new Error('Rate limit: retries epuises');
          await sleep(waitMs);
          attempt++;
          continue;
        }

        if (res.status >= 500) {
          if (attempt >= MAX_RETRIES) throw new Error(`Erreur serveur Sorare ${res.status}`);
          await sleep(backoffMs(attempt));
          attempt++;
          continue;
        }

        if (!res.ok) {
          throw new Error(`Erreur HTTP Sorare ${res.status}`);
        }

        const json = (await res.json()) as GraphQLResponse<T>;
        if (json.errors?.length) {
          throw new Error('GraphQL: ' + json.errors.map((e) => e.message).join('; '));
        }
        if (!json.data) throw new Error('Reponse GraphQL sans data');
        return json.data;
      } catch (err) {
        const isNetwork =
          err instanceof TypeError || (err instanceof Error && /fetch|network/i.test(err.message));
        if (isNetwork && attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt));
          attempt++;
          continue;
        }
        throw err;
      }
    }
  }
}

/** Backoff exponentiel avec jitter. */
export function backoffMs(attempt: number): number {
  const base = Math.min(8000, 500 * 2 ** attempt);
  const jitter = Math.random() * 300;
  return base + jitter;
}

export const sorareClient = new SorareClient();
