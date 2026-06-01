import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { TargetPlayer, BlacklistedUser, BotSettings } from '../api/types';
import { fmtCents } from '../api/format';

/**
 * Editeurs de configuration : joueurs cibles, blacklist, parametres generaux.
 * Validation cote client + sauvegarde en base via l'API. Aucun secret ici.
 */
export function Settings() {
  return (
    <div className="grid" style={{ gap: 18 }}>
      <GeneralSettings />
      <div className="grid cols-2">
        <TargetsEditor />
        <BlacklistEditor />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function GeneralSettings() {
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [pollSec, setPollSec] = useState('15');
  const [dryRun, setDryRun] = useState(true);
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('4000');
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const s = await api.getSettings();
    setSettings(s);
    setPollSec(String(s.pollIntervalMs / 1000));
    setDryRun(s.dryRun);
    setHost(s.bindingHost);
    setPort(String(s.bindingPort));
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setMsg(null);
    const ms = Math.round(Number(pollSec) * 1000);
    if (Number.isNaN(ms) || ms < 3000) {
      setMsg('Intervalle invalide (≥ 3 s).');
      return;
    }
    try {
      await api.updateSettings({
        pollIntervalMs: ms,
        dryRun,
        bindingHost: host.trim() || '127.0.0.1',
        bindingPort: Number(port) || 4000,
      });
      setMsg('Paramètres enregistrés ✓');
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="card">
      <h3>Paramètres généraux</h3>
      <div className="row">
        <label className="field">
          Intervalle de polling (s)
          <input value={pollSec} onChange={(e) => setPollSec(e.target.value)} inputMode="numeric" />
        </label>
        <label className="field">
          Dry-run
          <select value={dryRun ? '1' : '0'} onChange={(e) => setDryRun(e.target.value === '1')}>
            <option value="1">Activé (simulation)</option>
            <option value="0">Désactivé (réel)</option>
          </select>
        </label>
        <label className="field">
          Binding host
          <input value={host} onChange={(e) => setHost(e.target.value)} />
        </label>
        <label className="field">
          Binding port
          <input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" />
        </label>
        <button className="btn primary" onClick={save}>
          Enregistrer
        </button>
      </div>
      <small className="hint">
        Le host/port de binding s'appliquent au prochain démarrage du backend (lecture via .env au
        boot ; ce champ persiste votre préférence en base). Désactiver le dry-run reste sans effet
        si la clé Starkware est absente.
      </small>
      {settings && (
        <p className="muted" style={{ marginTop: 8 }}>
          Actuel : {settings.pollIntervalMs / 1000}s · {settings.dryRun ? 'dry-run' : 'réel'} ·{' '}
          {settings.bindingHost}:{settings.bindingPort}
        </p>
      )}
      {msg && <div className="banner info">{msg}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
function TargetsEditor() {
  const [targets, setTargets] = useState<TargetPlayer[]>([]);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [maxEuros, setMaxEuros] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => setTargets(await api.listTargets());
  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    setMsg(null);
    if (!slug.trim() || !name.trim()) {
      setMsg('Slug et nom requis.');
      return;
    }
    const cents = Math.round(Number(maxEuros) * 100);
    if (Number.isNaN(cents) || cents <= 0) {
      setMsg('Plafond invalide.');
      return;
    }
    try {
      await api.createTarget({
        playerSlug: slug.trim(),
        displayName: name.trim(),
        maxPriceCents: cents,
        enabled: true,
      });
      setSlug('');
      setName('');
      setMaxEuros('');
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const toggle = async (t: TargetPlayer) => {
    await api.updateTarget(t.id, { enabled: !t.enabled });
    await load();
  };

  const editCap = async (t: TargetPlayer) => {
    const v = prompt(`Nouveau plafond pour ${t.displayName} (en €)`, String(t.maxPriceCents / 100));
    if (v === null) return;
    const cents = Math.round(Number(v) * 100);
    if (Number.isNaN(cents) || cents <= 0) return;
    await api.updateTarget(t.id, { maxPriceCents: cents });
    await load();
  };

  const remove = async (id: number) => {
    if (!confirm('Supprimer ce joueur cible ?')) return;
    await api.deleteTarget(id);
    await load();
  };

  return (
    <div className="card">
      <h3>Joueurs cibles + plafonds</h3>
      <div className="row">
        <label className="field">
          Slug joueur
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="kylian-mbappe" />
        </label>
        <label className="field">
          Nom affiché
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kylian Mbappé" />
        </label>
        <label className="field">
          Plafond (€)
          <input value={maxEuros} onChange={(e) => setMaxEuros(e.target.value)} placeholder="100" inputMode="decimal" />
        </label>
        <button className="btn primary" onClick={add}>
          + Ajouter
        </button>
      </div>
      {msg && <div className="banner err">{msg}</div>}
      {targets.length === 0 ? (
        <div className="empty">Aucun joueur ciblé.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Joueur</th>
              <th>Slug</th>
              <th>Plafond</th>
              <th>Actif</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.id}>
                <td>{t.displayName}</td>
                <td><small className="hint">{t.playerSlug}</small></td>
                <td style={{ cursor: 'pointer' }} onClick={() => editCap(t)} title="Cliquer pour modifier">
                  {fmtCents(t.maxPriceCents)} ✎
                </td>
                <td>
                  <button className={`btn ${t.enabled ? 'success' : ''}`} onClick={() => toggle(t)}>
                    {t.enabled ? 'Oui' : 'Non'}
                  </button>
                </td>
                <td>
                  <button className="btn danger" onClick={() => remove(t.id)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function BlacklistEditor() {
  const [list, setList] = useState<BlacklistedUser[]>([]);
  const [slug, setSlug] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => setList(await api.listBlacklist());
  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    setMsg(null);
    if (!slug.trim()) {
      setMsg('Slug requis.');
      return;
    }
    try {
      await api.createBlacklist({ userSlug: slug.trim(), note: note.trim() || null });
      setSlug('');
      setNote('');
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const remove = async (id: number) => {
    await api.deleteBlacklist(id);
    await load();
  };

  return (
    <div className="card">
      <h3>Utilisateurs blacklistés</h3>
      <div className="row">
        <label className="field">
          Slug utilisateur
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="un-utilisateur" />
        </label>
        <label className="field">
          Note (optionnel)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="raison" />
        </label>
        <button className="btn primary" onClick={add}>
          + Ajouter
        </button>
      </div>
      {msg && <div className="banner err">{msg}</div>}
      {list.length === 0 ? (
        <div className="empty">Aucun utilisateur blacklisté.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Slug</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id}>
                <td>{b.userSlug}</td>
                <td><small className="hint">{b.note ?? '—'}</small></td>
                <td>
                  <button className="btn danger" onClick={() => remove(b.id)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
