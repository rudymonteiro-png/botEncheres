// Types miroir du domaine backend (subset utile au frontend).

export type BotStatus = 'stopped' | 'running' | 'paused';

export type DecisionOutcome =
  | 'BID_PLACED'
  | 'BID_SIMULATED'
  | 'ABSTAIN'
  | 'OVER_CAP'
  | 'ERROR';

export type AbstainReason =
  | 'ALREADY_OWNED'
  | 'BLACKLISTED_BIDDER'
  | 'OVER_CAP'
  | 'ALREADY_LEADING'
  | 'AUCTION_CLOSED'
  | 'NOT_A_TARGET'
  | 'INSUFFICIENT_BALANCE'
  | 'NO_STARK_KEY'
  | 'DRY_RUN'
  | 'NONE';

export type AuctionTrackStatus = 'IN_RACE' | 'ABSTAIN' | 'WON' | 'LOST' | 'WATCHING';

export interface AuctionBid {
  bidderSlug: string | null;
  bidderNickname: string | null;
  amountCents: number | null;
}

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

export interface TargetPlayer {
  id: number;
  playerSlug: string;
  displayName: string;
  maxPriceCents: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BlacklistedUser {
  id: number;
  userSlug: string;
  note: string | null;
  createdAt: string;
}

export interface BotSettings {
  pollIntervalMs: number;
  dryRun: boolean;
  bindingHost: string;
  bindingPort: number;
}

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

export interface AuthStatus {
  authenticated: boolean;
  userSlug: string | null;
  awaitingOtp: boolean;
  expiredAt: string | null;
  hasCredentials: boolean;
}
