import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AuthStatus } from '../api/types';

/**
 * Panneau d'authentification Sorare.
 * - Affiche l'etat (authentifie / 2FA en attente / identifiants manquants).
 * - Permet de declencher signIn et de soumettre un code OTP (jamais stocke).
 * Aucun secret n'est affiche ni editable ici.
 */
export function AuthPanel() {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [otp, setOtp] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setStatus(await api.authStatus());
    } catch {
      /* noop */
    }
  };

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, []);

  const doSignIn = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.signIn();
      if (r.ok) setMsg('Authentifié ✓');
      else if (r.otpRequired) setMsg('Code 2FA requis : saisissez-le ci-dessous.');
      else setMsg(`Échec : ${r.error ?? 'inconnu'}`);
      await refresh();
    } catch (e) {
      setMsg(`Erreur : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const submitOtp = async () => {
    if (!otp.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.submitOtp(otp.trim());
      setMsg(r.ok ? '2FA validée ✓' : `Échec 2FA : ${r.error ?? 'inconnu'}`);
      setOtp('');
      await refresh();
    } catch (e) {
      setMsg(`Erreur : ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3>Authentification Sorare</h3>
      {!status?.hasCredentials && (
        <div className="banner warn">
          Identifiants Sorare absents. Renseignez <code>SORARE_EMAIL</code> et{' '}
          <code>SORARE_PASSWORD</code> dans le fichier <code>.env</code> côté backend, puis
          redémarrez.
        </div>
      )}
      <div className="row">
        <div>
          <div className="muted">État</div>
          <div>
            {status?.authenticated ? (
              <span className="badge green">Authentifié{status.userSlug ? ` — ${status.userSlug}` : ''}</span>
            ) : status?.awaitingOtp ? (
              <span className="badge amber">2FA en attente</span>
            ) : (
              <span className="badge gray">Non authentifié</span>
            )}
          </div>
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={doSignIn} disabled={busy || !status?.hasCredentials}>
          {busy ? '…' : 'Se connecter'}
        </button>
      </div>

      {status?.awaitingOtp && (
        <div className="row" style={{ marginTop: 12 }}>
          <label className="field">
            Code 2FA (OTP)
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              inputMode="numeric"
            />
          </label>
          <button className="btn success" onClick={submitOtp} disabled={busy}>
            Valider le code
          </button>
          <small className="hint">Le code n'est jamais stocké, juste transmis au backend.</small>
        </div>
      )}

      {msg && <div className="banner info" style={{ marginTop: 12 }}>{msg}</div>}
      {status?.expiredAt && (
        <small className="hint">JWT valide jusqu'au {new Date(status.expiredAt).toLocaleString('fr-FR')}</small>
      )}
    </div>
  );
}
