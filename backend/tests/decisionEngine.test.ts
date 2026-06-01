import { describe, it, expect } from 'vitest';
import { decide, type DecisionContext } from '../src/bot/decisionEngine.js';
import type { AuctionBid } from '../src/types/domain.js';

/**
 * Tests unitaires de la logique de DECISION :
 *   - possession
 *   - blacklist
 *   - plafond
 *   - leadership / solde / auction fermee / cible
 */

function baseCtx(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    auctionOpen: true,
    playerSlug: 'kylian-mbappe',
    targets: new Map([['kylian-mbappe', 10000]]), // plafond 100.00 EUR
    alreadyOwned: false,
    bidders: [],
    blacklist: new Set<string>(),
    bestBidderSlug: null,
    mySlug: 'me-slug',
    minNextBidCents: 5000, // 50.00 EUR
    walletBalanceCents: 100000, // 1000.00 EUR
    ...overrides,
  };
}

describe('decisionEngine.decide', () => {
  it('enchierit quand tout est OK (cible, non possede, sous plafond, solde ok)', () => {
    const d = decide(baseCtx());
    expect(d.shouldBid).toBe(true);
    expect(d.reason).toBe('NONE');
    expect(d.bidAmountCents).toBe(5000);
    expect(d.maxPriceCents).toBe(10000);
  });

  it("s'abstient si l'auction est fermee", () => {
    const d = decide(baseCtx({ auctionOpen: false }));
    expect(d.shouldBid).toBe(false);
    expect(d.reason).toBe('AUCTION_CLOSED');
  });

  it("s'abstient si le joueur n'est pas une cible", () => {
    const d = decide(baseCtx({ playerSlug: 'inconnu-joueur' }));
    expect(d.shouldBid).toBe(false);
    expect(d.reason).toBe('NOT_A_TARGET');
  });

  it("s'abstient si playerSlug est null", () => {
    const d = decide(baseCtx({ playerSlug: null }));
    expect(d.shouldBid).toBe(false);
    expect(d.reason).toBe('NOT_A_TARGET');
  });

  it('POSSESSION : s\'abstient si je possede deja le joueur', () => {
    const d = decide(baseCtx({ alreadyOwned: true }));
    expect(d.shouldBid).toBe(false);
    expect(d.reason).toBe('ALREADY_OWNED');
    expect(d.maxPriceCents).toBe(10000);
  });

  it('BLACKLIST : s\'abstient si un encherisseur est blackliste', () => {
    const bidders: AuctionBid[] = [
      { bidderSlug: 'cheater123', bidderNickname: 'Cheater', amountCents: 4000 },
    ];
    const d = decide(
      baseCtx({ bidders, blacklist: new Set(['cheater123']) })
    );
    expect(d.shouldBid).toBe(false);
    expect(d.reason).toBe('BLACKLISTED_BIDDER');
  });

  it('BLACKLIST : comparaison insensible a la casse', () => {
    const bidders: AuctionBid[] = [
      { bidderSlug: 'CheaterXYZ', bidderNickname: null, amountCents: 4000 },
    ];
    const d = decide(baseCtx({ bidders, blacklist: new Set(['cheaterxyz']) }));
    expect(d.shouldBid).toBe(false);
    expect(d.reason).toBe('BLACKLISTED_BIDDER');
  });

  it('BLACKLIST : enchierit si encherisseurs non blacklistes', () => {
    const bidders: AuctionBid[] = [
      { bidderSlug: 'honest-user', bidderNickname: 'Honest', amountCents: 4000 },
    ];
    const d = decide(baseCtx({ bidders, blacklist: new Set(['someone-else']) }));
    expect(d.shouldBid).toBe(true);
  });

  it('PLAFOND : s\'abstient si prochaine enchere mini > plafond', () => {
    const d = decide(baseCtx({ minNextBidCents: 10001 })); // 1 centime au-dessus
    expect(d.shouldBid).toBe(false);
    expect(d.reason).toBe('OVER_CAP');
    expect(d.maxPriceCents).toBe(10000);
  });

  it('PLAFOND : enchierit si prochaine enchere mini == plafond (limite incluse)', () => {
    const d = decide(baseCtx({ minNextBidCents: 10000 }));
    expect(d.shouldBid).toBe(true);
    expect(d.bidAmountCents).toBe(10000);
  });

  it('LEADERSHIP : s\'abstient si je suis deja le meilleur encherisseur', () => {
    const d = decide(baseCtx({ bestBidderSlug: 'me-slug' }));
    expect(d.shouldBid).toBe(false);
    expect(d.reason).toBe('ALREADY_LEADING');
  });

  it('LEADERSHIP : enchierit si un autre mene', () => {
    const d = decide(baseCtx({ bestBidderSlug: 'autre-user' }));
    expect(d.shouldBid).toBe(true);
  });

  it('SOLDE : s\'abstient si solde wallet insuffisant', () => {
    const d = decide(baseCtx({ walletBalanceCents: 4999, minNextBidCents: 5000 }));
    expect(d.shouldBid).toBe(false);
    expect(d.reason).toBe('INSUFFICIENT_BALANCE');
  });

  it('SOLDE : enchierit si solde inconnu (null) - pas de blocage', () => {
    const d = decide(baseCtx({ walletBalanceCents: null }));
    expect(d.shouldBid).toBe(true);
  });

  it('ORDRE DE PRIORITE : possession prime sur plafond', () => {
    const d = decide(baseCtx({ alreadyOwned: true, minNextBidCents: 99999 }));
    expect(d.reason).toBe('ALREADY_OWNED');
  });

  it('ORDRE DE PRIORITE : blacklist prime sur plafond', () => {
    const bidders: AuctionBid[] = [
      { bidderSlug: 'bad', bidderNickname: null, amountCents: 1 },
    ];
    const d = decide(
      baseCtx({ bidders, blacklist: new Set(['bad']), minNextBidCents: 99999 })
    );
    expect(d.reason).toBe('BLACKLISTED_BIDDER');
  });

  it('cibles insensibles a la casse', () => {
    const d = decide(
      baseCtx({ playerSlug: 'Kylian-Mbappe', targets: new Map([['kylian-mbappe', 10000]]) })
    );
    expect(d.shouldBid).toBe(true);
  });
});
