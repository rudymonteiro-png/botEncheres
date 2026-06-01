import { useCallback, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { Dashboard } from './components/Dashboard';
import { History } from './components/History';
import { Settings } from './components/Settings';
import type { ActionLog } from './api/types';

type Tab = 'dashboard' | 'history' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [historyRefresh, setHistoryRefresh] = useState(0);

  // Chaque nouvelle action poussee par le WS rafraichit l'historique.
  const onAction = useCallback((_a: ActionLog) => {
    setHistoryRefresh((n) => n + 1);
  }, []);

  const { state, connected } = useWebSocket(onAction);

  return (
    <>
      <header className="app-header">
        <div>
          <h1>⚽ Sorare Bid Bot — Superviseur</h1>
          <div className="sub">
            Marché primaire · API GraphQL officielle · {state?.dryRun ? 'Mode dry-run' : 'Mode réel'}
          </div>
        </div>
        <div>
          <span className={`dot ${connected ? 'on' : 'off'}`} />
          {connected ? 'Temps réel actif' : 'Reconnexion…'}
        </div>
      </header>

      <nav className="tabs">
        <button className={`tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
          Dashboard
        </button>
        <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          Historique
        </button>
        <button className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
          Configuration
        </button>
      </nav>

      <main className="content">
        {tab === 'dashboard' && <Dashboard state={state} connected={connected} />}
        {tab === 'history' && <History refreshSignal={historyRefresh} />}
        {tab === 'settings' && <Settings />}
      </main>
    </>
  );
}
