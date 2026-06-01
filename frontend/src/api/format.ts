import type { AbstainReason, AuctionTrackStatus, DecisionOutcome } from './types';

/** Centimes -> "12,34 €". null -> "—". */
export function fmtCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return (
    (cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
    ' €'
  );
}

/** ISO -> heure locale lisible. */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('fr-FR');
}

/** Compte a rebours simple jusqu'a endDate. */
export function fmtCountdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'terminé';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export const REASON_LABELS: Record<AbstainReason, string> = {
  ALREADY_OWNED: 'Joueur déjà possédé',
  BLACKLISTED_BIDDER: 'Enchérisseur blacklisté',
  OVER_CAP: 'Dépassement de plafond',
  ALREADY_LEADING: 'Déjà meilleur enchérisseur',
  AUCTION_CLOSED: 'Auction fermée',
  NOT_A_TARGET: 'Joueur non ciblé',
  INSUFFICIENT_BALANCE: 'Solde insuffisant',
  NO_STARK_KEY: 'Clé Starkware absente (dry-run)',
  DRY_RUN: 'Mode simulation',
  NONE: '—',
};

export const STATUS_LABELS: Record<AuctionTrackStatus, string> = {
  IN_RACE: 'En lice',
  ABSTAIN: 'Abstention',
  WON: 'Gagnée',
  LOST: 'Perdue',
  WATCHING: 'Surveillée',
};

export const OUTCOME_LABELS: Record<DecisionOutcome, string> = {
  BID_PLACED: 'Enchère placée',
  BID_SIMULATED: 'Enchère simulée',
  ABSTAIN: 'Abstention',
  OVER_CAP: 'Dépassement plafond',
  ERROR: 'Erreur',
};
