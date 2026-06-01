import { getDb } from './database.js';
import type {
  TargetPlayer,
  BlacklistedUser,
  BotSettings,
  ActionLog,
} from '../types/domain.js';

/** Mapping ligne SQLite -> TargetPlayer. */
interface TargetRow {
  id: number;
  player_slug: string;
  display_name: string;
  max_price_cents: number;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function mapTarget(r: TargetRow): TargetPlayer {
  return {
    id: r.id,
    playerSlug: r.player_slug,
    displayName: r.display_name,
    maxPriceCents: r.max_price_cents,
    enabled: r.enabled === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
//  Joueurs cibles
// ---------------------------------------------------------------------------
export const targetsRepo = {
  list(): TargetPlayer[] {
    const rows = getDb()
      .prepare(`SELECT * FROM target_players ORDER BY display_name COLLATE NOCASE`)
      .all() as TargetRow[];
    return rows.map(mapTarget);
  },

  listEnabled(): TargetPlayer[] {
    const rows = getDb()
      .prepare(`SELECT * FROM target_players WHERE enabled = 1`)
      .all() as TargetRow[];
    return rows.map(mapTarget);
  },

  create(input: {
    playerSlug: string;
    displayName: string;
    maxPriceCents: number;
    enabled: boolean;
  }): TargetPlayer {
    const stmt = getDb().prepare(
      `INSERT INTO target_players (player_slug, display_name, max_price_cents, enabled)
       VALUES (?, ?, ?, ?)`
    );
    const info = stmt.run(
      input.playerSlug,
      input.displayName,
      input.maxPriceCents,
      input.enabled ? 1 : 0
    );
    return this.getById(Number(info.lastInsertRowid))!;
  },

  update(
    id: number,
    input: Partial<{
      displayName: string;
      maxPriceCents: number;
      enabled: boolean;
    }>
  ): TargetPlayer | null {
    const current = this.getById(id);
    if (!current) return null;
    getDb()
      .prepare(
        `UPDATE target_players
         SET display_name = ?, max_price_cents = ?, enabled = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(
        input.displayName ?? current.displayName,
        input.maxPriceCents ?? current.maxPriceCents,
        (input.enabled ?? current.enabled) ? 1 : 0,
        id
      );
    return this.getById(id);
  },

  getById(id: number): TargetPlayer | null {
    const row = getDb()
      .prepare(`SELECT * FROM target_players WHERE id = ?`)
      .get(id) as TargetRow | undefined;
    return row ? mapTarget(row) : null;
  },

  delete(id: number): boolean {
    const info = getDb().prepare(`DELETE FROM target_players WHERE id = ?`).run(id);
    return info.changes > 0;
  },
};

// ---------------------------------------------------------------------------
//  Utilisateurs blacklistes
// ---------------------------------------------------------------------------
interface BlacklistRow {
  id: number;
  user_slug: string;
  note: string | null;
  created_at: string;
}

export const blacklistRepo = {
  list(): BlacklistedUser[] {
    const rows = getDb()
      .prepare(`SELECT * FROM blacklisted_users ORDER BY user_slug COLLATE NOCASE`)
      .all() as BlacklistRow[];
    return rows.map((r) => ({
      id: r.id,
      userSlug: r.user_slug,
      note: r.note,
      createdAt: r.created_at,
    }));
  },

  /** Renvoie un Set de slugs en minuscules pour comparaison rapide. */
  slugSet(): Set<string> {
    const rows = getDb()
      .prepare(`SELECT user_slug FROM blacklisted_users`)
      .all() as { user_slug: string }[];
    return new Set(rows.map((r) => r.user_slug.toLowerCase()));
  },

  create(input: { userSlug: string; note: string | null }): BlacklistedUser {
    const info = getDb()
      .prepare(`INSERT INTO blacklisted_users (user_slug, note) VALUES (?, ?)`)
      .run(input.userSlug, input.note);
    const row = getDb()
      .prepare(`SELECT * FROM blacklisted_users WHERE id = ?`)
      .get(Number(info.lastInsertRowid)) as BlacklistRow;
    return { id: row.id, userSlug: row.user_slug, note: row.note, createdAt: row.created_at };
  },

  delete(id: number): boolean {
    const info = getDb().prepare(`DELETE FROM blacklisted_users WHERE id = ?`).run(id);
    return info.changes > 0;
  },
};

// ---------------------------------------------------------------------------
//  Settings (cle/valeur)
// ---------------------------------------------------------------------------
export const settingsRepo = {
  getAll(): BotSettings {
    const rows = getDb().prepare(`SELECT key, value FROM settings`).all() as {
      key: string;
      value: string;
    }[];
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      pollIntervalMs: Number(map.get('poll_interval_ms') ?? 15000),
      dryRun: (map.get('dry_run') ?? '1') === '1',
      bindingHost: map.get('binding_host') ?? '127.0.0.1',
      bindingPort: Number(map.get('binding_port') ?? 4000),
    };
  },

  update(input: Partial<BotSettings>): BotSettings {
    const set = getDb().prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    );
    if (input.pollIntervalMs !== undefined)
      set.run('poll_interval_ms', String(input.pollIntervalMs));
    if (input.dryRun !== undefined) set.run('dry_run', input.dryRun ? '1' : '0');
    if (input.bindingHost !== undefined) set.run('binding_host', input.bindingHost);
    if (input.bindingPort !== undefined) set.run('binding_port', String(input.bindingPort));
    return this.getAll();
  },
};

// ---------------------------------------------------------------------------
//  Historique des actions
// ---------------------------------------------------------------------------
interface ActionRow {
  id: number;
  created_at: string;
  auction_id: string | null;
  player_slug: string | null;
  player_name: string | null;
  outcome: string;
  reason: string;
  current_price_cents: number | null;
  min_next_bid_cents: number | null;
  max_price_cents: number | null;
  bid_amount_cents: number | null;
  dry_run: number;
  message: string | null;
}

function mapAction(r: ActionRow): ActionLog {
  return {
    id: r.id,
    createdAt: r.created_at,
    auctionId: r.auction_id,
    playerSlug: r.player_slug,
    playerName: r.player_name,
    outcome: r.outcome as ActionLog['outcome'],
    reason: r.reason as ActionLog['reason'],
    currentPriceCents: r.current_price_cents,
    minNextBidCents: r.min_next_bid_cents,
    maxPriceCents: r.max_price_cents,
    bidAmountCents: r.bid_amount_cents,
    dryRun: r.dry_run === 1,
    message: r.message,
  };
}

export const actionLogsRepo = {
  insert(entry: Omit<ActionLog, 'id' | 'createdAt'>): ActionLog {
    const info = getDb()
      .prepare(
        `INSERT INTO action_logs
         (auction_id, player_slug, player_name, outcome, reason,
          current_price_cents, min_next_bid_cents, max_price_cents, bid_amount_cents,
          dry_run, message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.auctionId,
        entry.playerSlug,
        entry.playerName,
        entry.outcome,
        entry.reason,
        entry.currentPriceCents,
        entry.minNextBidCents,
        entry.maxPriceCents,
        entry.bidAmountCents,
        entry.dryRun ? 1 : 0,
        entry.message
      );
    const row = getDb()
      .prepare(`SELECT * FROM action_logs WHERE id = ?`)
      .get(Number(info.lastInsertRowid)) as ActionRow;
    return mapAction(row);
  },

  list(opts: { limit?: number; offset?: number; auctionId?: string } = {}): ActionLog[] {
    const limit = Math.min(opts.limit ?? 100, 1000);
    const offset = opts.offset ?? 0;
    if (opts.auctionId) {
      const rows = getDb()
        .prepare(
          `SELECT * FROM action_logs WHERE auction_id = ?
           ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
        )
        .all(opts.auctionId, limit, offset) as ActionRow[];
      return rows.map(mapAction);
    }
    const rows = getDb()
      .prepare(
        `SELECT * FROM action_logs ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
      )
      .all(limit, offset) as ActionRow[];
    return rows.map(mapAction);
  },

  count(): number {
    const row = getDb().prepare(`SELECT COUNT(*) AS c FROM action_logs`).get() as {
      c: number;
    };
    return row.c;
  },
};
