import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { ActionLog, DecisionOutcome } from '../api/types';
import { fmtCents, fmtTime, OUTCOME_LABELS, REASON_LABELS } from '../api/format';

type SortKey = 'createdAt' | 'playerName' | 'outcome' | 'bidAmountCents';

/** Table d'historique filtrable et triable de toutes les actions du bot. */
export function History({ refreshSignal }: { refreshSignal: number }) {
  const [items, setItems] = useState<ActionLog[]>([]);
  const [total, setTotal] = useState(0);
  const [filterOutcome, setFilterOutcome] = useState<DecisionOutcome | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getHistory(500, 0);
      setItems(data.items);
      setTotal(data.total);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [refreshSignal]);

  const filtered = useMemo(() => {
    let rows = items;
    if (filterOutcome !== 'ALL') rows = rows.filter((r) => r.outcome === filterOutcome);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.playerName ?? '').toLowerCase().includes(q) ||
          (r.playerSlug ?? '').toLowerCase().includes(q) ||
          (r.auctionId ?? '').toLowerCase().includes(q)
      );
    }
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'playerName':
          cmp = (a.playerName ?? '').localeCompare(b.playerName ?? '');
          break;
        case 'outcome':
          cmp = a.outcome.localeCompare(b.outcome);
          break;
        case 'bidAmountCents':
          cmp = (a.bidAmountCents ?? 0) - (b.bidAmountCents ?? 0);
          break;
        default:
          cmp = a.createdAt.localeCompare(b.createdAt);
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [items, filterOutcome, search, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const arrow = (key: SortKey) => (sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : '');

  const outcomeBadge = (o: DecisionOutcome): string => {
    switch (o) {
      case 'BID_PLACED':
        return 'green';
      case 'BID_SIMULATED':
        return 'blue';
      case 'OVER_CAP':
        return 'amber';
      case 'ERROR':
        return 'red';
      default:
        return 'gray';
    }
  };

  return (
    <div className="card">
      <h3>Historique des actions ({total})</h3>
      <div className="toolbar">
        <input
          placeholder="Rechercher joueur / auction…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 240 }}
        />
        <select
          value={filterOutcome}
          onChange={(e) => setFilterOutcome(e.target.value as DecisionOutcome | 'ALL')}
        >
          <option value="ALL">Tous les résultats</option>
          <option value="BID_PLACED">Enchères placées</option>
          <option value="BID_SIMULATED">Enchères simulées</option>
          <option value="ABSTAIN">Abstentions</option>
          <option value="OVER_CAP">Dépassements plafond</option>
          <option value="ERROR">Erreurs</option>
        </select>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? '…' : '↻ Rafraîchir'}
        </button>
        <div className="spacer" />
        <small className="hint">{filtered.length} ligne(s) affichée(s)</small>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">Aucune action enregistrée.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th onClick={() => toggleSort('createdAt')}>Date{arrow('createdAt')}</th>
              <th onClick={() => toggleSort('playerName')}>Joueur{arrow('playerName')}</th>
              <th onClick={() => toggleSort('outcome')}>Résultat{arrow('outcome')}</th>
              <th>Raison</th>
              <th>Prix actuel</th>
              <th>Mini suiv.</th>
              <th>Plafond</th>
              <th onClick={() => toggleSort('bidAmountCents')}>Enchère{arrow('bidAmountCents')}</th>
              <th>Mode</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <small>{fmtTime(r.createdAt)}</small>
                </td>
                <td>{r.playerName ?? '—'}</td>
                <td>
                  <span className={`badge ${outcomeBadge(r.outcome)}`}>
                    {OUTCOME_LABELS[r.outcome]}
                  </span>
                </td>
                <td>
                  <small>{REASON_LABELS[r.reason]}</small>
                </td>
                <td>{fmtCents(r.currentPriceCents)}</td>
                <td>{fmtCents(r.minNextBidCents)}</td>
                <td>{fmtCents(r.maxPriceCents)}</td>
                <td>{fmtCents(r.bidAmountCents)}</td>
                <td>
                  {r.dryRun ? (
                    <span className="badge amber">dry</span>
                  ) : (
                    <span className="badge green">réel</span>
                  )}
                </td>
                <td>
                  <small className="hint">{r.message ?? ''}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
