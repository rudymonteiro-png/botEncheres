import { useState } from 'react';
import type { BotState } from '../api/types';
import { api } from '../api/client';
import { fmtCents, fmtTime, fmtCountdown, REASON_LABELS, STATUS_LABELS } from '../api/format';
import { AuthPanel } from './AuthPanel';

/** Dashboard temps reel : etat du bot, controles, auctions suivies. */
export function Dashboard({ state, connected }: { state: BotState | null; connected: boolean }) {
  const [busy, setBusy] = useState(false);

  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const status = state?.status ?? 'stopped';

  const statusBadge =
    status === 'running' ? 'green' : status === 'paused' ? 'amber' : 'gray';

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* Bandeau securite */}
      {state?.dryRun && (
        <div className="banner warn">
          <strong>Mode DRY-RUN actif.</strong>{' '}
          {state.starkKeyLoaded
            ? 'Les enchères sont simulées (DRY_RUN=true). Aucune enchère réelle envoyée.'
            : 'Clé Starkware absente → les enchères réelles sont impossibles. Toutes les actions sont simulées.'}
        </div>
      )}

      {/* Stats */}
      <div className="grid cols-4">
        <div className="stat">
          <div className="label">État du bot</div>
          <div className="value">
            <span className={`badge ${statusBadge}`}>
              {status === 'running' ? 'Actif' : status === 'paused' ? 'En pause' : 'Arrêté'}
            </span>
          </div>
        </div>
        <div className="stat">
          <div className="label">Mode</div>
          <div className="value">
            <span className={`badge ${state?.dryRun ? 'amber' : 'green'}`}>
              {state?.dryRun ? 'Dry-run' : 'Réel'}
            </span>
          </div>
        </div>
        <div className="stat">
          <div className="label">Solde wallet fiat</div>
          <div className="value">{fmtCents(state?.walletBalanceCents)}</div>
          {state?.walletKycStatus && <small className="hint">KYC : {state.walletKycStatus}</small>}
        </div>
        <div className="stat">
          <div className="label">Connexion temps réel</div>
          <div className="value" style={{ fontSize: 16 }}>
            <span className={`dot ${connected ? 'on' : 'off'}`} />
            {connected ? 'WebSocket OK' : 'Déconnecté'}
          </div>
          <small className="hint">Dernier scan : {fmtTime(state?.lastPollAt)}</small>
        </div>
      </div>

      {/* Controles */}
      <div className="card">
        <h3>Contrôle du moteur</h3>
        <div className="controls">
          <button
            className="btn success"
            disabled={busy || status === 'running'}
            onClick={() => action(api.startBot)}
          >
            ▶ Démarrer
          </button>
          <button
            className="btn"
            disabled={busy || status !== 'running'}
            onClick={() => action(api.pauseBot)}
          >
            ⏸ Pause
          </button>
          <button
            className="btn danger"
            disabled={busy || status === 'stopped'}
            onClick={() => action(api.stopBot)}
          >
            ⏹ Arrêter
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => action(api.loadDemo)}
            title="Injecte des auctions fictives pour visualiser l'interface sans connexion Sorare"
          >
            🎬 Charger la démo
          </button>
          <div className="spacer" />
          <span className="muted">
            Intervalle de polling : {state ? `${state.pollIntervalMs / 1000}s` : '—'} ·{' '}
            {state?.authenticated ? (
              <span className="badge green">Sorare authentifié</span>
            ) : (
              <span className="badge gray">Sorare non authentifié</span>
            )}
          </span>
        </div>
      </div>

      <div className="grid cols-2">
        <AuthPanel />
        <div className="card">
          <h3>Résumé</h3>
          <p className="muted">
            Auctions suivies : <strong style={{ color: 'var(--text)' }}>{state?.trackedAuctions.length ?? 0}</strong>
          </p>
          <p className="muted">
            Clé Starkware :{' '}
            {state?.starkKeyLoaded ? (
              <span className="badge green">Chargée</span>
            ) : (
              <span className="badge gray">Absente (dry-run forcé)</span>
            )}
          </p>
        </div>
      </div>

      {/* Auctions suivies */}
      <div className="card">
        <h3>Auctions suivies en direct</h3>
        {!state || state.trackedAuctions.length === 0 ? (
          <div className="empty">
            Aucune auction suivie pour le moment.
            <br />
            Ajoutez des joueurs cibles puis démarrez le bot.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Joueur</th>
                <th>Prix actuel</th>
                <th>Mini suivant</th>
                <th>Mon plafond</th>
                <th>Statut</th>
                <th>Fin</th>
                <th>Enchérisseurs</th>
              </tr>
            </thead>
            <tbody>
              {state.trackedAuctions.map((a) => (
                <tr key={a.auctionId}>
                  <td>
                    <strong>{a.playerName}</strong>
                    <br />
                    <small className="hint">{a.playerSlug}</small>
                  </td>
                  <td>{fmtCents(a.currentPriceCents)}</td>
                  <td>{fmtCents(a.minNextBidCents)}</td>
                  <td>{fmtCents(a.maxPriceCents)}</td>
                  <td>
                    <span
                      className={`badge ${
                        a.status === 'IN_RACE'
                          ? 'green'
                          : a.status === 'ABSTAIN'
                          ? 'amber'
                          : a.status === 'WON'
                          ? 'green'
                          : a.status === 'LOST'
                          ? 'red'
                          : 'gray'
                      }`}
                    >
                      {STATUS_LABELS[a.status]}
                    </span>
                    {a.reason !== 'NONE' && (
                      <>
                        <br />
                        <small className="hint">{REASON_LABELS[a.reason]}</small>
                      </>
                    )}
                  </td>
                  <td>{fmtCountdown(a.endDate)}</td>
                  <td>
                    {a.bidders.length}
                    {a.iAmLeading && <span className="badge blue" style={{ marginLeft: 6 }}>je mène</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
