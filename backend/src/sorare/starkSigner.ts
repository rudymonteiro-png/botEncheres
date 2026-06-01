import { config, hasStarkKey } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/**
 * Module de signature Starkware - CODE MAIS DESACTIVE PAR DEFAUT.
 *
 * Pour ARMER les encheres reelles, il faut :
 *   1. fournir SORARE_STARK_PRIVATE_KEY dans .env
 *   2. installer le paquet officiel : `npm i @sorare/crypto`
 *
 * Tant que la cle n'est pas presente, isAvailable() renvoie false et le moteur
 * reste en mode lecture/simulation : AUCUNE signature, AUCUNE enchere reelle.
 *
 * Le chargement de @sorare/crypto est fait dynamiquement (import()) pour que le
 * backend demarre meme si le paquet n'est pas installe.
 */

export interface AuthorizationRequest {
  __typename: string;
  // champs variables selon le type (Starkex* ou MangopayWalletTransfer*)
  [key: string]: unknown;
}

export interface AuthorizationItem {
  fingerprint: string;
  request: AuthorizationRequest;
}

/** Approval pret a etre envoye dans bidInput.approvals. */
export interface AuthorizationApproval {
  fingerprint: string;
  starkexTransferApproval?: { nonce: number; expirationTimestamp: number; signature: unknown };
  starkexLimitOrderApproval?: { nonce: number; expirationTimestamp: number; signature: unknown };
  mangopayWalletTransferApproval?: { nonce: number; signature: unknown };
}

export class StarkSigner {
  private signFn: ((privateKey: string, request: unknown) => unknown) | null = null;
  private loaded = false;

  /** True uniquement si une cle privee est configuree. */
  isAvailable(): boolean {
    return hasStarkKey();
  }

  /** Charge @sorare/crypto a la demande (lazy). */
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      // Import dynamique via variable : ne casse pas le build si le paquet est absent
      // (la resolution de type statique est evitee).
      const pkg = '@sorare/crypto';
      const mod: any = await import(/* @vite-ignore */ pkg);
      this.signFn = mod.signAuthorizationRequest;
      this.loaded = true;
    } catch {
      throw new Error(
        "Le paquet '@sorare/crypto' n'est pas installe. " +
          'Executez `npm i @sorare/crypto` dans backend/ pour armer les encheres reelles.'
      );
    }
  }

  /**
   * Signe une liste d'AuthorizationRequest et construit les approvals.
   * Reproduit examples/authorizations.js de sorare/api.
   */
  async buildApprovals(authorizations: AuthorizationItem[]): Promise<AuthorizationApproval[]> {
    if (!this.isAvailable()) {
      throw new Error('Cle Starkware absente : signature impossible (mode reel non arme).');
    }
    await this.ensureLoaded();
    const privateKey = config.sorare.starkPrivateKey;

    return authorizations.map((auth) => {
      const req = auth.request;
      const signature = this.signFn!(privateKey, req);

      switch (req.__typename) {
        case 'StarkexTransferAuthorizationRequest':
          return {
            fingerprint: auth.fingerprint,
            starkexTransferApproval: {
              nonce: req.nonce as number,
              expirationTimestamp: req.expirationTimestamp as number,
              signature,
            },
          };
        case 'StarkexLimitOrderAuthorizationRequest':
          return {
            fingerprint: auth.fingerprint,
            starkexLimitOrderApproval: {
              nonce: req.nonce as number,
              expirationTimestamp: req.expirationTimestamp as number,
              signature,
            },
          };
        case 'MangopayWalletTransferAuthorizationRequest':
          // C'est la voie WALLET FIAT.
          return {
            fingerprint: auth.fingerprint,
            mangopayWalletTransferApproval: {
              nonce: req.nonce as number,
              signature,
            },
          };
        default:
          throw new Error(`Type d'autorisation inconnu: ${req.__typename}`);
      }
    });
  }

  logStatus(): void {
    if (this.isAvailable()) {
      logger.info('Cle Starkware chargee : encheres reelles possibles (si DRY_RUN=false).');
    } else {
      logger.info('Cle Starkware absente : mode lecture/dry-run uniquement.');
    }
  }
}

export const starkSigner = new StarkSigner();
