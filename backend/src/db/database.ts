import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/**
 * Initialisation du fichier SQLite unique + schema.
 * Aucun setup serveur : un seul fichier sur disque.
 */

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS target_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  max_price_cents INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS blacklisted_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_slug TEXT NOT NULL UNIQUE,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS action_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  auction_id TEXT,
  player_slug TEXT,
  player_name TEXT,
  outcome TEXT NOT NULL,
  reason TEXT NOT NULL,
  current_price_cents INTEGER,
  min_next_bid_cents INTEGER,
  max_price_cents INTEGER,
  bid_amount_cents INTEGER,
  dry_run INTEGER NOT NULL DEFAULT 1,
  message TEXT
);

CREATE INDEX IF NOT EXISTS idx_action_logs_created_at ON action_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_auction ON action_logs(auction_id);
`;

export function initDatabase(): Database.Database {
  if (db) return db;

  const dir = path.dirname(config.databasePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(config.databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  // Valeurs de settings par defaut (idempotent)
  const insertSetting = db.prepare(
    `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`
  );
  insertSetting.run('poll_interval_ms', String(config.bot.pollIntervalMs));
  insertSetting.run('dry_run', config.bot.dryRun ? '1' : '0');
  insertSetting.run('binding_host', config.host);
  insertSetting.run('binding_port', String(config.port));

  logger.info('SQLite initialisee', { path: config.databasePath });
  return db;
}

export function getDb(): Database.Database {
  if (!db) return initDatabase();
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
