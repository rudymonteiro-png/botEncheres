import { sorareClient } from './client.js';
import { sorareAuth } from './auth.js';
import { logger } from '../utils/logger.js';
import type { AuctionBid } from '../types/domain.js';

/**
 * Requetes GraphQL metier vers Sorare.
 * Tous les montants Sorare fiat (availableBalance, MangopayWalletTransfer.amount)
 * sont en CENTIMES (Int). Les prix d'auction (currentPrice/minNextBid) sont des
 * strings dans la devise de l'auction.
 */

// ---------------------------------------------------------------------------
//  config { exchangeRate { id } }  (necessaire pour prepareBid)
// ---------------------------------------------------------------------------
const CONFIG_QUERY = `
query ConfigQuery {
  config { exchangeRate { id } }
}`;

export async function fetchExchangeRateId(): Promise<string> {
  const data = await sorareClient.request<{
    config: { exchangeRate: { id: string } };
  }>(CONFIG_QUERY, {}, true);
  return data.config.exchangeRate.id;
}

// ---------------------------------------------------------------------------
//  Solde wallet fiat (PrivateFiatWalletAccount.availableBalance, en centimes)
// ---------------------------------------------------------------------------
const WALLET_QUERY = `
query WalletQuery {
  currentUser {
    slug
    privateAccounts {
      ... on PrivateFiatWalletAccount {
        availableBalance
        totalBalance
        kycStatus
        state
      }
    }
  }
}`;

export interface WalletInfo {
  availableBalanceCents: number | null;
  kycStatus: string | null;
}

export async function fetchFiatWallet(): Promise<WalletInfo> {
  try {
    const data = await sorareClient.request<{
      currentUser: {
        privateAccounts: Array<{
          availableBalance?: number;
          kycStatus?: string;
        }>;
      } | null;
    }>(WALLET_QUERY, {}, true);

    const accounts = data.currentUser?.privateAccounts ?? [];
    const fiat = accounts.find((a) => typeof a.availableBalance === 'number');
    return {
      availableBalanceCents: fiat?.availableBalance ?? null,
      kycStatus: fiat?.kycStatus ?? null,
    };
  } catch (err) {
    logger.warn('Lecture wallet fiat impossible', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { availableBalanceCents: null, kycStatus: null };
  }
}

// ---------------------------------------------------------------------------
//  Ma galerie : est-ce que je possede deja une carte de ce joueur ?
// ---------------------------------------------------------------------------
const MY_CARDS_BY_PLAYER_QUERY = `
query MyCardsByPlayer($slug: String!) {
  currentUser {
    cards(playerSlugs: [$slug], first: 1) {
      nodes { slug anyPlayer { slug } }
    }
  }
}`;

export async function ownsPlayer(playerSlug: string): Promise<boolean> {
  try {
    const data = await sorareClient.request<{
      currentUser: { cards: { nodes: Array<{ slug: string }> } } | null;
    }>(MY_CARDS_BY_PLAYER_QUERY, { slug: playerSlug }, true);
    const nodes = data.currentUser?.cards?.nodes ?? [];
    return nodes.length > 0;
  } catch (err) {
    // En cas d'echec on est PRUDENT : on considere qu'on ne sait pas -> false,
    // mais on log. Le moteur traitera l'incertitude separement si besoin.
    logger.warn('Verification possession impossible', {
      playerSlug,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
//  Auctions live du marche primaire
// ---------------------------------------------------------------------------
const LIVE_AUCTIONS_QUERY = `
query LiveAuctions($last: Int!) {
  tokens {
    liveAuctions(last: $last) {
      nodes {
        id
        open
        endDate
        currentPrice
        minNextBid
        bestBid {
          amounts { eur }
          bidder { ... on User { slug nickname } }
        }
        bids(last: 20) {
          nodes {
            amounts { eur }
            bidder { ... on User { slug nickname } }
          }
        }
        anyCards {
          slug
          anyPlayer { slug displayName }
        }
      }
    }
  }
}`;

export interface RawAuction {
  id: string;
  open: boolean;
  endDate: string;
  currentPrice: string;
  minNextBid: string;
  playerSlug: string | null;
  playerName: string | null;
  bestBidderSlug: string | null;
  bidders: AuctionBid[];
}

interface AuctionNode {
  id: string;
  open: boolean;
  endDate: string;
  currentPrice: string;
  minNextBid: string;
  bestBid: {
    amounts: { eur: number | null } | null;
    bidder: { slug?: string; nickname?: string } | null;
  } | null;
  bids: {
    nodes: Array<{
      amounts: { eur: number | null } | null;
      bidder: { slug?: string; nickname?: string } | null;
    }>;
  };
  anyCards: Array<{ slug: string; anyPlayer: { slug: string; displayName: string } | null }>;
}

export async function fetchLiveAuctions(last = 50): Promise<RawAuction[]> {
  const data = await sorareClient.request<{
    tokens: { liveAuctions: { nodes: AuctionNode[] } };
  }>(LIVE_AUCTIONS_QUERY, { last }, true);

  return data.tokens.liveAuctions.nodes.map((n) => {
    const firstCard = n.anyCards[0];
    const player = firstCard?.anyPlayer ?? null;
    const bidders: AuctionBid[] = (n.bids?.nodes ?? []).map((b) => ({
      bidderSlug: b.bidder?.slug ?? null,
      bidderNickname: b.bidder?.nickname ?? null,
      amountCents: b.amounts?.eur ?? null,
    }));
    return {
      id: n.id,
      open: n.open,
      endDate: n.endDate,
      currentPrice: n.currentPrice,
      minNextBid: n.minNextBid,
      playerSlug: player?.slug ?? null,
      playerName: player?.displayName ?? null,
      bestBidderSlug: n.bestBid?.bidder?.slug ?? null,
      bidders,
    };
  });
}

// ---------------------------------------------------------------------------
//  Verifie si je suis le meilleur encherisseur d'une auction donnee
// ---------------------------------------------------------------------------
export function isLeading(auction: RawAuction): boolean {
  const me = sorareAuth.getUserSlug();
  if (!me || !auction.bestBidderSlug) return false;
  return auction.bestBidderSlug.toLowerCase() === me.toLowerCase();
}
