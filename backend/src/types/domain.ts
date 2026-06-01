/**
 * Types du domaine metier, partages dans tout le backend.
 * (Le frontend a une copie miniature de ces types cote frontend/src/api.)
 */

/** Etat global du moteur du bot. */
export type BotStatus = 'stopped' | 'running' | 'paused';

/** Resultat d'une decision prise par le moteur pour une auction donnee. */
export type DecisionOutcome =
  | 'BID_PLACED' // enchere placee (reelle)
  | 'BID_SIMULATED' // enchere simulee (dry-run)
  | 'ABSTAIN' // abstention volontaire
  | 'OVER_CAP' // depassement de plafond
  | 'ERROR'; // erreur technique

/** Raisons normalisees d'abstention / non-enchere. */
export type AbstainReason =
  | 'ALREADY_OWNED' // je possede deja ce joueur
  | 'BLACKLISTED_BIDDER' // un encherisseur est dans la blacklist
  | 'OVER_CAP' // prochaine enchere mini > plafond
  | 'ALREADY_LEADING' // je suis deja le meilleur encherisseur
  | 'AUCTION_CLOSED' // auction fermee/terminee
  | 'NOT_A_TARGET' // joueur non cible
  | 'INSUFFICIENT_BALANCE' // solde wallet fiat insuffisant
  | 'NO_STARK_KEY' // mode reel demande mais cle Starkware absente
  | 'DRY_RUN' // simulation active
  | 'NONE';

/** Un joueur cible avec son plafond. Montants en centimes (entier). */
export interface TargetPlayer {
  id: number;
  playerSlug: string;
  displayName: string;
  maxPriceCents: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Un utilisateur blackliste (slug Sorare). */
export interface BlacklistedUser {
  id: number;
  userSlug: string;
  note: string | null;
  createdAt: string;
}

/** Parametres generaux du bot, persistes en base. */
export interface BotSettings {
  pollIntervalMs: number;
  dryRun: boolean;
  bindingHost: string;
  bindingPort: number;
}

/** Entree d'historique d'une decision/action du bot. */
export interface ActionLog {
  id: number;
  createdAt: string;
  auctionId: string | null;
  playerSlug: string | null;
  playerName: string | null;
  outcome: DecisionOutcome;
  reason: AbstainReason;
  currentPriceCents: number | null;
  minNextBidCents: number | null;
  maxPriceCents: number | null;
  bidAmountCents: number | null;
  dryRun: boolean;
  message: string | null;
}

/** Enchere simplifiee provenant de Sorare. */
export interface AuctionBid {
  bidderSlug: string | null;
  bidderNickname: string | null;
  amountCents: number | null;
}

/** Vue normalisee d'une auction suivie par le bot. */
export interface TrackedAuction {
  auctionId: string;
  playerSlug: string;
  playerName: string;
  currentPriceCents: number;
  minNextBidCents: number;
  maxPriceCents: number | null;
  endDate: string;
  open: boolean;
  bestBidderSlug: string | null;
  iAmLeading: boolean;
  status: AuctionTrackStatus;
  reason: AbstainReason;
  bidders: AuctionBid[];
  lastEvaluatedAt: string;
}

/** Statut affiche pour une auction dans le dashboard. */
export type AuctionTrackStatus =
  | 'IN_RACE' // en lice (j'ai enchere ou je peux)
  | 'ABSTAIN' // abstention + raison
  | 'WON' // gagnee
  | 'LOST' // perdue
  | 'WATCHING'; // surveillee, pas encore d'action

/** Etat consolide pousse au dashboard. */
export interface BotState {
  status: BotStatus;
  dryRun: boolean;
  starkKeyLoaded: boolean;
  authenticated: boolean;
  walletBalanceCents: number | null;
  walletKycStatus: string | null;
  pollIntervalMs: number;
  lastPollAt: string | null;
  trackedAuctions: TrackedAuction[];
}
