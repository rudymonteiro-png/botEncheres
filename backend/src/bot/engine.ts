import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { eventBus } from '../utils/eventBus.js';
import { sorareAuth } from '../sorare/auth.js';
import { starkSigner } from '../sorare/starkSigner.js';
import {
  fetchLiveAuctions,
  fetchFiatWallet,
  ownsPlayer,
  isLeading,
  type RawAuction,
} from '../sorare/queries.js';
import { placeFiatBid } from '../sorare/bidService.js';
import { decide } from './decisionEngine.js';
import { targetsRepo, blacklistRepo, settingsRepo, actionLogsRepo } from '../db/repositories.js';
import { parsePriceToCents } from '../utils/money.js';
import type {
  BotStatus,
  BotState,
  TrackedAuction,
  AuctionTrackStatus,
  AbstainReason,
} from '../types/domain.js';

/**
 * Moteur du bot : boucle de polling, evaluation des auctions, decisions, encheres.
 * Controlable via start/pause/stop. Mode dry-run securise par defaut.
 */

class BotEngine {
  private status: BotStatus = 'stopped';
  private timer: NodeJS.Timeout | null = null;
  private lastPollAt: string | null = null;
  private trackedAuctions: TrackedAuction[] = [];
  private walletBalanceCents: number | null = null;
  private walletKycStatus: string | null = null;
  private polling = false;

  // ----- Controle -----
  async start(): Promise<void> {
    if (this.status === 'running') return;
    this.status = 'running';
    logger.info('Bot demarre', { dryRun: this.effectiveDryRun() });
    starkSigner.logStatus();
    this.scheduleNext(0);
    this.broadcastState();
  }

  pause(): void {
    if (this.status !== 'running') return;
    this.status = 'paused';
    this.clearTimer();
    logger.info('Bot en pause');
    this.broadcastState();
  }

  stop(): void {
    this.status = 'stopped';
    this.clearTimer();
    this.trackedAuctions = [];
    logger.info('Bot arrete');
    this.broadcastState();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(delayMs: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      void this.pollOnce();
    }, delayMs);
  }

  private pollIntervalMs(): number {
    return settingsRepo.getAll().pollIntervalMs || config.bot.pollIntervalMs;
  }

  /** Le dry-run effectif : true si DRY_RUN setting OU pas de cle Starkware. */
  private effectiveDryRun(): boolean {
    const settings = settingsRepo.getAll();
    return settings.dryRun || !starkSigner.isAvailable();
  }

  // ----- Boucle de polling -----
  private async pollOnce(): Promise<void> {
    if (this.status !== 'running') return;
    if (this.polling) {
      this.scheduleNext(this.pollIntervalMs());
      return;
    }
    this.polling = true;
    try {
      await this.evaluateAll();
      this.lastPollAt = new Date().toISOString();
    } catch (err) {
      logger.error('Erreur durant le polling', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.polling = false;
      if (this.status === 'running') this.scheduleNext(this.pollIntervalMs());
      this.broadcastState();
    }
  }

  private async evaluateAll(): Promise<void> {
    // Auth requise pour toutes les queries
    const authed = await sorareAuth.ensureAuthenticated();
    if (!authed) {
      logger.warn('Polling annule : non authentifie (2FA ou identifiants manquants)');
      return;
    }

    // Wallet fiat
    const wallet = await fetchFiatWallet();
    this.walletBalanceCents = wallet.availableBalanceCents;
    this.walletKycStatus = wallet.kycStatus;

    // Cibles & blacklist
    const targetsList = targetsRepo.listEnabled();
    if (targetsList.length === 0) {
      this.trackedAuctions = [];
      return;
    }
    const targetsMap = new Map(targetsList.map((t) => [t.playerSlug, t.maxPriceCents]));
    const targetSlugs = new Set(targetsList.map((t) => t.playerSlug.toLowerCase()));
    const blacklist = blacklistRepo.slugSet();

    // Auctions live
    const auctions = await fetchLiveAuctions(50);

    // Ne garder que les auctions de joueurs cibles
    const relevant = auctions.filter(
      (a) => a.playerSlug && targetSlugs.has(a.playerSlug.toLowerCase())
    );

    const tracked: TrackedAuction[] = [];
    for (const auction of relevant) {
      const t = await this.evaluateAuction(auction, targetsMap, blacklist);
      tracked.push(t);
    }
    this.trackedAuctions = tracked;
  }

  private async evaluateAuction(
    auction: RawAuction,
    targetsMap: Map<string, number>,
    blacklist: Set<string>
  ): Promise<TrackedAuction> {
    const minNextBidCents = parsePriceToCents(auction.minNextBid);
    const currentPriceCents = parsePriceToCents(auction.currentPrice);
    const mySlug = sorareAuth.getUserSlug();
    const iAmLeading = isLeading(auction);

    // Possession : on interroge la galerie
    const alreadyOwned = auction.playerSlug ? await ownsPlayer(auction.playerSlug) : false;

    const decision = decide({
      auctionOpen: auction.open,
      playerSlug: auction.playerSlug,
      targets: targetsMap,
      alreadyOwned,
      bidders: auction.bidders,
      blacklist,
      bestBidderSlug: auction.bestBidderSlug,
      mySlug,
      minNextBidCents,
      walletBalanceCents: this.walletBalanceCents,
    });

    const dryRun = this.effectiveDryRun();
    let status: AuctionTrackStatus = 'WATCHING';
    let reason: AbstainReason = decision.reason;

    if (decision.shouldBid) {
      if (dryRun) {
        // Simulation
        this.logAction({
          auction,
          outcome: 'BID_SIMULATED',
          reason: !starkSigner.isAvailable() ? 'NO_STARK_KEY' : 'DRY_RUN',
          currentPriceCents,
          minNextBidCents,
          maxPriceCents: decision.maxPriceCents,
          bidAmountCents: decision.bidAmountCents,
          dryRun: true,
          message: `Enchere simulee de ${decision.bidAmountCents}c (plafond ${decision.maxPriceCents}c)`,
        });
        status = 'IN_RACE';
        reason = 'DRY_RUN';
      } else {
        // Enchere reelle
        const result = await placeFiatBid({
          auctionId: auction.id,
          amountCents: decision.bidAmountCents,
        });
        if (result.ok) {
          this.logAction({
            auction,
            outcome: 'BID_PLACED',
            reason: 'NONE',
            currentPriceCents,
            minNextBidCents,
            maxPriceCents: decision.maxPriceCents,
            bidAmountCents: decision.bidAmountCents,
            dryRun: false,
            message: `Enchere reelle placee (bidId=${result.bidId ?? '?'})`,
          });
          status = 'IN_RACE';
          reason = 'NONE';
        } else {
          this.logAction({
            auction,
            outcome: 'ERROR',
            reason: 'NONE',
            currentPriceCents,
            minNextBidCents,
            maxPriceCents: decision.maxPriceCents,
            bidAmountCents: decision.bidAmountCents,
            dryRun: false,
            message: `Echec enchere: ${result.error}`,
          });
          status = 'ABSTAIN';
        }
      }
    } else {
      // Abstention : on logue les abstentions "interessantes" (pas les WATCHING triviaux)
      const outcome = decision.reason === 'OVER_CAP' ? 'OVER_CAP' : 'ABSTAIN';
      if (decision.reason !== 'NONE') {
        this.logAction({
          auction,
          outcome,
          reason: decision.reason,
          currentPriceCents,
          minNextBidCents,
          maxPriceCents: decision.maxPriceCents,
          bidAmountCents: null,
          dryRun,
          message: this.reasonMessage(decision.reason),
        });
      }
      status = iAmLeading ? 'IN_RACE' : 'ABSTAIN';
    }

    return {
      auctionId: auction.id,
      playerSlug: auction.playerSlug ?? '',
      playerName: auction.playerName ?? auction.playerSlug ?? 'Inconnu',
      currentPriceCents,
      minNextBidCents,
      maxPriceCents: decision.maxPriceCents,
      endDate: auction.endDate,
      open: auction.open,
      bestBidderSlug: auction.bestBidderSlug,
      iAmLeading,
      status,
      reason,
      bidders: auction.bidders,
      lastEvaluatedAt: new Date().toISOString(),
    };
  }

  private reasonMessage(reason: AbstainReason): string {
    switch (reason) {
      case 'ALREADY_OWNED':
        return 'Je possede deja ce joueur';
      case 'BLACKLISTED_BIDDER':
        return 'Un encherisseur est dans la blacklist';
      case 'OVER_CAP':
        return 'Prochaine enchere mini > plafond';
      case 'ALREADY_LEADING':
        return 'Je suis deja le meilleur encherisseur';
      case 'AUCTION_CLOSED':
        return 'Auction fermee';
      case 'INSUFFICIENT_BALANCE':
        return 'Solde wallet fiat insuffisant';
      default:
        return reason;
    }
  }

  private logAction(p: {
    auction: RawAuction;
    outcome: 'BID_PLACED' | 'BID_SIMULATED' | 'ABSTAIN' | 'OVER_CAP' | 'ERROR';
    reason: AbstainReason;
    currentPriceCents: number | null;
    minNextBidCents: number | null;
    maxPriceCents: number | null;
    bidAmountCents: number | null;
    dryRun: boolean;
    message: string;
  }): void {
    const entry = actionLogsRepo.insert({
      auctionId: p.auction.id,
      playerSlug: p.auction.playerSlug,
      playerName: p.auction.playerName,
      outcome: p.outcome,
      reason: p.reason,
      currentPriceCents: p.currentPriceCents,
      minNextBidCents: p.minNextBidCents,
      maxPriceCents: p.maxPriceCents,
      bidAmountCents: p.bidAmountCents,
      dryRun: p.dryRun,
      message: p.message,
    });
    eventBus.emitAction(entry);
  }

  // ----- Etat -----
  getState(): BotState {
    return {
      status: this.status,
      dryRun: this.effectiveDryRun(),
      starkKeyLoaded: starkSigner.isAvailable(),
      authenticated: sorareAuth.isAuthenticated(),
      walletBalanceCents: this.walletBalanceCents,
      walletKycStatus: this.walletKycStatus,
      pollIntervalMs: this.pollIntervalMs(),
      lastPollAt: this.lastPollAt,
      trackedAuctions: this.trackedAuctions,
    };
  }

  private broadcastState(): void {
    eventBus.emitState(this.getState());
  }

  /** Force un poll immediat (utile apres changement de config). */
  triggerPoll(): void {
    if (this.status === 'running' && !this.polling) {
      this.scheduleNext(0);
    }
  }
}

export const botEngine = new BotEngine();
