import 'dotenv/config';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Chargement et validation des variables d'environnement.
 * Les secrets restent ici, ne sont jamais serialises vers le frontend.
 */

// dotenv lit `.env` du cwd. On force aussi la racine du repo si lance depuis backend/.
import dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Tente de charger le .env a la racine du monorepo (../../.. depuis dist/utils ou src/utils)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const EnvSchema = z.object({
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  SORARE_EMAIL: z.string().default(''),
  SORARE_PASSWORD: z.string().default(''),
  SORARE_JWT_AUD: z.string().default('sorare-bid-bot'),
  SORARE_API_KEY: z.string().default(''),
  SORARE_STARK_PRIVATE_KEY: z.string().default(''),

  DRY_RUN: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() !== 'false'),
  POLL_INTERVAL_MS: z.coerce.number().int().min(3000).default(15000),

  SORARE_GRAPHQL_URL: z.string().default('https://api.sorare.com/graphql'),
  SORARE_USERS_URL: z.string().default('https://api.sorare.com/api/v1/users'),

  DATABASE_PATH: z.string().default('./data/sorare-bot.sqlite'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = EnvSchema.parse(process.env);

export const config = {
  host: parsed.HOST,
  port: parsed.PORT,
  corsOrigin: parsed.CORS_ORIGIN,

  sorare: {
    email: parsed.SORARE_EMAIL,
    password: parsed.SORARE_PASSWORD,
    jwtAud: parsed.SORARE_JWT_AUD,
    apiKey: parsed.SORARE_API_KEY,
    starkPrivateKey: parsed.SORARE_STARK_PRIVATE_KEY,
    graphqlUrl: parsed.SORARE_GRAPHQL_URL,
    usersUrl: parsed.SORARE_USERS_URL,
  },

  bot: {
    dryRun: parsed.DRY_RUN,
    pollIntervalMs: parsed.POLL_INTERVAL_MS,
  },

  databasePath: path.isAbsolute(parsed.DATABASE_PATH)
    ? parsed.DATABASE_PATH
    : path.resolve(__dirname, '../../', parsed.DATABASE_PATH),

  logLevel: parsed.LOG_LEVEL,
} as const;

/** Indique si les credentials de connexion Sorare sont fournis. */
export function hasSorareCredentials(): boolean {
  return Boolean(config.sorare.email && config.sorare.password);
}

/** Indique si la cle privee Starkware est chargee (necessaire pour enchere reelle). */
export function hasStarkKey(): boolean {
  return Boolean(config.sorare.starkPrivateKey);
}
