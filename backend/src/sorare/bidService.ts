import { sorareClient } from './client.js';
import { fetchExchangeRateId } from './queries.js';
import { starkSigner, type AuthorizationItem } from './starkSigner.js';
import { logger } from '../utils/logger.js';
import { randomBytes } from 'node:crypto';

/**
 * Service d'enchere : orchestre le flux complet (prepareBid -> signature -> bid),
 * paye depuis le WALLET fiat.
 *
 * Ce flux n'est appele QUE si :
 *   - le mode reel est arme (DRY_RUN=false)
 *   - la cle Starkware est presente (starkSigner.isAvailable())
 * Sinon, le moteur passe en simulation et n'appelle jamais ce service.
 */

const AUTH_FRAGMENT = `
fragment AuthorizationRequestFragment on AuthorizationRequest {
  fingerprint
  request {
    __typename
    ... on StarkexLimitOrderAuthorizationRequest {
      vaultIdSell vaultIdBuy amountSell amountBuy tokenSell tokenBuy
      nonce expirationTimestamp
      feeInfo { feeLimit tokenId sourceVaultId }
    }
    ... on StarkexTransferAuthorizationRequest {
      amount condition expirationTimestamp
      feeInfoUser { feeLimit sourceVaultId tokenId }
      nonce receiverPublicKey receiverVaultId senderVaultId token
    }
    ... on MangopayWalletTransferAuthorizationRequest {
      nonce amount currency operationHash mangopayWalletId
    }
  }
}`;

const PREPARE_BID_MUTATION = `
mutation PrepareBid($input: prepareBidInput!) {
  prepareBid(input: $input) {
    authorizations { ...AuthorizationRequestFragment }
    errors { message }
  }
}
${AUTH_FRAGMENT}`;

const BID_MUTATION = `
mutation Bid($input: bidInput!) {
  bid(input: $input) {
    tokenBid { id }
    errors { message }
  }
}`;

export interface BidParams {
  auctionId: string;
  /** Montant en centimes (devise EUR par defaut). */
  amountCents: number;
  currency?: 'EUR' | 'USD' | 'GBP';
}

export interface BidResult {
  ok: boolean;
  bidId?: string;
  error?: string;
}

export async function placeFiatBid(params: BidParams): Promise<BidResult> {
  const currency = params.currency ?? 'EUR';

  if (!starkSigner.isAvailable()) {
    return { ok: false, error: 'Cle Starkware absente : enchere reelle impossible.' };
  }

  try {
    // 1. Exchange rate id
    const exchangeRateId = await fetchExchangeRateId();

    // 2. settlementInfo : paiement WALLET fiat
    const settlementInfo = {
      currency,
      paymentMethod: 'WALLET',
      exchangeRateId,
    };

    // 3. prepareBid -> AuthorizationRequest[]
    const prepared = await sorareClient.request<{
      prepareBid: {
        authorizations: AuthorizationItem[] | null;
        errors: { message: string }[];
      };
    }>(
      PREPARE_BID_MUTATION,
      {
        input: {
          auctionId: params.auctionId,
          amount: String(params.amountCents),
          settlementInfo,
        },
      },
      true
    );

    if (prepared.prepareBid.errors?.length) {
      return {
        ok: false,
        error: 'prepareBid: ' + prepared.prepareBid.errors.map((e) => e.message).join('; '),
      };
    }
    const authorizations = prepared.prepareBid.authorizations ?? [];

    // 4. Signature Starkware -> approvals
    const approvals = await starkSigner.buildApprovals(authorizations);

    // 5. bid
    const bidInput = {
      approvals,
      auctionId: params.auctionId,
      amount: String(params.amountCents),
      settlementInfo,
      clientMutationId: randomBytes(8).join(''),
    };

    const result = await sorareClient.request<{
      bid: { tokenBid: { id: string } | null; errors: { message: string }[] };
    }>(BID_MUTATION, { input: bidInput }, true);

    if (result.bid.errors?.length) {
      return { ok: false, error: 'bid: ' + result.bid.errors.map((e) => e.message).join('; ') };
    }
    const bidId = result.bid.tokenBid?.id;
    logger.info('Enchere reelle placee', { auctionId: params.auctionId, bidId });
    return { ok: true, bidId: bidId ?? undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Echec enchere reelle', { auctionId: params.auctionId, error: msg });
    return { ok: false, error: msg };
  }
}
