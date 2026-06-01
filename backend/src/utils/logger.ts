import { config } from './config.js';

/**
 * Logger structure (JSON) minimaliste.
 * SECURITE : ne jamais passer de secret (mdp, JWT, cle Starkware, salt) en argument.
 * Une fonction de redaction filtre les cles sensibles par precaution.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEYS = [
  'password',
  'hashedpassword',
  'token',
  'jwt',
  'jwttoken',
  'authorization',
  'apikey',
  'salt',
  'privatekey',
  'starkprivatekey',
  'signature',
  'otp',
  'otpattempt',
];

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
        out[k] = '***REDACTED***';
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[config.logLevel]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ? { meta: redact(meta) as Record<string, unknown> } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
};
