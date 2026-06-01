import type { AbstainReason, AuctionBid } from '../types/domain.js';

/**
 * Moteur de DECISION pur (sans effet de bord, sans I/O) -> 100% testable.
 *
 * Pour chaque auction pertinente, applique dans l'ordre :
 *   1. auction ouverte ?
 *   2. joueur cible et actif ?
 *   3. je ne possede pas deja le joueur
 *   4. aucun encherisseur dans la blacklist
 *   5. je ne suis pas deja le meilleur encherisseur (sinon inutile de surenc.)
 *   6. prochaine enchere mini <= plafond
 *   7. solde wallet fiat suffisant
 */

export interface DecisionContext {
  auctionOpen: boolean;
  /** Slug du joueur de l'auction (null si inconnu). */
  playerSlug: string | null;
  /** Map slug->plafond (centimes) des joueurs cibles ACTIFS. */
  targets: Map<string, number>;
  /** True si je possede deja une carte de ce joueur. */
  alreadyOwned: boolean;
  /** Encherisseurs actuels de l'auction. */
  bidders: AuctionBid[];
  /** Set de slugs blacklistes (minuscules). */
  blacklist: Set<string>;
  /** Slug du meilleur encherisseur actuel (null si aucun). */
  bestBidderSlug: string | null;
  /** Mon propre slug (pour detecter si je mene). */
  mySlug: string | null;
  /** Prochaine enchere minimale en centimes. */
  minNextBidCents: number;
  /** Solde wallet fiat dispo en centimes (null = inconnu). */
  walletBalanceCents: number | null;
}

export interface Decision {
  /** True si on doit enchierir (reelle ou simulee selon le mode). */
  shouldBid: boolean;
  reason: AbstainReason;
  /** Montant a encherir (centimes) si shouldBid. */
  bidAmountCents: number;
  /** Plafond du joueur (centimes) si cible. */
  maxPriceCents: number | null;
}

export function decide(ctx: DecisionContext): Decision {
  const noBid = (reason: AbstainReason, maxPriceCents: number | null = null): Decision => ({
    shouldBid: false,
    reason,
    bidAmountCents: 0,
    maxPriceCents,
  });

  // 1. Auction fermee
  if (!ctx.auctionOpen) return noBid('AUCTION_CLOSED');

  // 2. Joueur cible & actif
  if (!ctx.playerSlug) return noBid('NOT_A_TARGET');
  const slug = ctx.playerSlug.toLowerCase();
  // Recherche insensible a la casse dans la map
  let maxPriceCents: number | null = null;
  for (const [k, v] of ctx.targets) {
    if (k.toLowerCase() === slug) {
      maxPriceCents = v;
      break;
    }
  }
  if (maxPriceCents === null) return noBid('NOT_A_TARGET');

  // 3. Possession deja acquise
  if (ctx.alreadyOwned) return noBid('ALREADY_OWNED', maxPriceCents);

  // 4. Blacklist : un encherisseur present figure dans la blacklist -> abstention
  for (const b of ctx.bidders) {
    if (b.bidderSlug && ctx.blacklist.has(b.bidderSlug.toLowerCase())) {
      return noBid('BLACKLISTED_BIDDER', maxPriceCents);
    }
  }

  // 5. Je suis deja le meilleur encherisseur -> ne pas surenchierir contre moi-meme
  if (
    ctx.mySlug &&
    ctx.bestBidderSlug &&
    ctx.bestBidderSlug.toLowerCase() === ctx.mySlug.toLowerCase()
  ) {
    return noBid('ALREADY_LEADING', maxPriceCents);
  }

  // 6. Plafond
  if (ctx.minNextBidCents > maxPriceCents) {
    return noBid('OVER_CAP', maxPriceCents);
  }

  // 7. Solde wallet fiat suffisant (si connu)
  if (ctx.walletBalanceCents !== null && ctx.minNextBidCents > ctx.walletBalanceCents) {
    return noBid('INSUFFICIENT_BALANCE', maxPriceCents);
  }

  // Decision : enchierir au minimum requis (strategie conservatrice).
  return {
    shouldBid: true,
    reason: 'NONE',
    bidAmountCents: ctx.minNextBidCents,
    maxPriceCents,
  };
}
