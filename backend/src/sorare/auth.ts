import bcrypt from 'bcryptjs';
import { config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

/**
 * Gestion de l'authentification Sorare.
 *
 * Flux documente (sorare/api) :
 *  1. GET /api/v1/users/<email>  -> { salt }
 *  2. hashedPassword = bcrypt.hashSync(password, salt)        (cote serveur)
 *  3. mutation signIn(email, password=hashed) -> jwtToken{token, expiredAt}
 *     - Si currentUser null && pas d'erreur && otpSessionChallenge => 2FA requise
 *  4. Headers pour requetes suivantes : Authorization: Bearer <jwt> + JWT-AUD: <aud>
 *
 * Le JWT vit 30 jours. Stocke EN MEMOIRE uniquement (jamais sur disque).
 * La 2FA ne concerne QUE le signIn (pas chaque enchere).
 */

export interface AuthState {
  authenticated: boolean;
  userSlug: string | null;
  /** True si signIn attend un code OTP (2FA). */
  awaitingOtp: boolean;
  expiredAt: string | null;
}

interface SignInResult {
  ok: boolean;
  /** 2FA requise : il faut rappeler signInWithOtp avec le code. */
  otpRequired?: boolean;
  /** Acceptation de CGU requise. */
  mustAcceptTerms?: boolean;
  error?: string;
}

const SIGN_IN_MUTATION = `
mutation SignInMutation($input: signInInput!, $aud: String!) {
  signIn(input: $input) {
    currentUser { slug }
    jwtToken(aud: $aud) { token expiredAt }
    otpSessionChallenge
    tcuToken
    errors { message }
  }
}`;

export class SorareAuth {
  private jwt: string | null = null;
  private jwtExpiredAt: Date | null = null;
  private userSlug: string | null = null;
  private otpSessionChallenge: string | null = null;
  private awaitingOtp = false;

  /** Recupere le salt bcrypt pour l'email donne. */
  private async fetchSalt(email: string): Promise<string> {
    const url = `${config.sorare.usersUrl}/${encodeURIComponent(email)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'content-type': 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Echec recuperation du salt (HTTP ${res.status})`);
    }
    const data = (await res.json()) as { salt?: string };
    if (!data.salt) throw new Error('Salt absent de la reponse Sorare');
    return data.salt;
  }

  /** Hash bcrypt du mot de passe avec le salt fourni par Sorare. */
  private hashPassword(password: string, salt: string): string {
    return bcrypt.hashSync(password, salt);
  }

  /** Appel brut de la mutation signIn. */
  private async callSignIn(variables: Record<string, unknown>): Promise<SignInResult> {
    const res = await fetch(config.sorare.graphqlUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operationName: 'SignInMutation',
        query: SIGN_IN_MUTATION,
        variables: { ...variables, aud: config.sorare.jwtAud },
      }),
    });

    const json = (await res.json()) as {
      data?: {
        signIn?: {
          currentUser: { slug: string } | null;
          jwtToken: { token: string; expiredAt: string } | null;
          otpSessionChallenge: string | null;
          tcuToken: string | null;
          errors: { message: string }[];
        };
      };
      errors?: { message: string }[];
    };

    if (json.errors?.length) {
      return { ok: false, error: json.errors.map((e) => e.message).join('; ') };
    }
    const s = json.data?.signIn;
    if (!s) return { ok: false, error: 'Reponse signIn vide' };

    if (s.errors?.length) {
      const msg = s.errors.map((e) => e.message).join('; ');
      if (/accept.*terms|tcu/i.test(msg)) return { ok: false, mustAcceptTerms: true, error: msg };
      return { ok: false, error: msg };
    }

    // 2FA : currentUser null + challenge present
    if (!s.currentUser && s.otpSessionChallenge) {
      this.otpSessionChallenge = s.otpSessionChallenge;
      this.awaitingOtp = true;
      return { ok: false, otpRequired: true };
    }

    if (s.currentUser && s.jwtToken) {
      this.jwt = s.jwtToken.token;
      this.jwtExpiredAt = new Date(s.jwtToken.expiredAt);
      this.userSlug = s.currentUser.slug;
      this.awaitingOtp = false;
      this.otpSessionChallenge = null;
      return { ok: true };
    }

    return { ok: false, error: 'Etat signIn inattendu' };
  }

  /** Premiere etape : login email/mot de passe. Peut demander une 2FA. */
  async signIn(): Promise<SignInResult> {
    if (!config.sorare.email || !config.sorare.password) {
      return { ok: false, error: 'Identifiants Sorare absents (.env)' };
    }
    try {
      const salt = await this.fetchSalt(config.sorare.email);
      const hashed = this.hashPassword(config.sorare.password, salt);
      const result = await this.callSignIn({
        input: { email: config.sorare.email, password: hashed },
      });
      if (result.ok) logger.info('Authentifie aupres de Sorare', { userSlug: this.userSlug });
      else if (result.otpRequired) logger.warn('2FA requise : code OTP attendu');
      else logger.error('Echec signIn', { error: result.error });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Exception signIn', { error: msg });
      return { ok: false, error: msg };
    }
  }

  /** Deuxieme etape 2FA : on fournit le code OTP (jamais stocke). */
  async signInWithOtp(otpAttempt: string): Promise<SignInResult> {
    if (!this.otpSessionChallenge) {
      return { ok: false, error: 'Aucun challenge OTP en cours. Relancez signIn.' };
    }
    const result = await this.callSignIn({
      input: { otpSessionChallenge: this.otpSessionChallenge, otpAttempt },
    });
    if (result.ok) logger.info('2FA validee, authentifie', { userSlug: this.userSlug });
    else logger.error('Echec validation 2FA', { error: result.error });
    return result;
  }

  /** Assure un JWT valide ; re-signin si expire/absent (hors cas 2FA). */
  async ensureAuthenticated(): Promise<boolean> {
    if (this.jwt && this.jwtExpiredAt && this.jwtExpiredAt.getTime() > Date.now() + 60_000) {
      return true;
    }
    const result = await this.signIn();
    return result.ok;
  }

  /** Headers d'autorisation pour le client GraphQL. */
  getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.jwt) {
      headers['Authorization'] = `Bearer ${this.jwt}`;
      headers['JWT-AUD'] = config.sorare.jwtAud;
    }
    if (config.sorare.apiKey) {
      headers['APIKEY'] = config.sorare.apiKey;
    }
    return headers;
  }

  getState(): AuthState {
    return {
      authenticated: Boolean(
        this.jwt && this.jwtExpiredAt && this.jwtExpiredAt.getTime() > Date.now()
      ),
      userSlug: this.userSlug,
      awaitingOtp: this.awaitingOtp,
      expiredAt: this.jwtExpiredAt ? this.jwtExpiredAt.toISOString() : null,
    };
  }

  isAuthenticated(): boolean {
    return this.getState().authenticated;
  }

  getUserSlug(): string | null {
    return this.userSlug;
  }
}

export const sorareAuth = new SorareAuth();
