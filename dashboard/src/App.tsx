import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api, fmt, getToken, setToken } from './api';
import AuthPage from './pages/Auth';
import Store from './pages/Store';
import MyGames from './pages/MyGames';
import GameDetail from './pages/GameDetail';

interface Ctx { user: any; refresh: () => Promise<void>; logout: () => void; toast: (m: string, kind?: 'ok' | 'err') => void }
const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; m: string; kind: string }[]>([]);
  const nav = useNavigate();

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setReady(true); return; }
    try { setUser((await api.get('/api/me')).user); } catch { setUser(null); }
    setReady(true);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const toast = useCallback((m: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, m, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  const logout = () => { setToken(null); setUser(null); nav('/login'); };

  if (!ready) return <div className="center muted">Loading…</div>;
  const ctx = { user, refresh, logout, toast };

  return (
    <AppCtx.Provider value={ctx}>
      {user ? (
        <div className="shell">
          <header className="topbar">
            <Link to="/" className="brand"><span className="logo">♦</span> MiniGame Studio</Link>
            <nav>
              <NavLink to="/" end>Store</NavLink>
              <NavLink to="/games">My games</NavLink>
              <a href="/docs/" target="_blank" rel="noreferrer">Docs ↗</a>
            </nav>
            <div className="spacer" />
            <div className="wallet" title="Demo currency used to buy games">
              <span className="coin">●</span> {fmt(user.balance)} <small>credits</small>
            </div>
            <button className="btn ghost sm" onClick={async () => { await api.post('/api/wallet/topup'); await refresh(); toast('Added 5,000 demo credits'); }}>+ Top up</button>
            <button className="btn ghost sm" onClick={logout} title={user.email}>Sign out</button>
          </header>
          <main className="page">
            <Routes>
              <Route path="/" element={<Store />} />
              <Route path="/games" element={<MyGames />} />
              <Route path="/games/:id/*" element={<GameDetail />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
      ) : (
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      )}
      <div className="toasts">{toasts.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.m}</div>)}</div>
    </AppCtx.Provider>
  );
}

export function Modal({ children, onClose, title }: { children: ReactNode; onClose?: () => void; title: string }) {
  return (
    <div className="modal-bg" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" role="dialog" aria-label={title}>
        <h3>{title}</h3>{children}
      </div>
    </div>
  );
}
