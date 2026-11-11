import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, fmt, getToken, setToken } from './api';
import { Icon, useTheme, Button } from './ui';
import AuthPage from './pages/Auth';
import Overview from './pages/Overview';
import Store from './pages/Store';
import MyGames from './pages/MyGames';
import GameDetail from './pages/GameDetail';

interface Ctx { user: any; refresh: () => Promise<void>; logout: () => void; toast: (m: string, kind?: 'ok' | 'err') => void }
const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; m: string; kind: string }[]>([]);
  const [theme, toggleTheme] = useTheme();
  const nav = useNavigate();
  const loc = useLocation();

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setReady(true); return; }
    try { setUser((await api.get('/api/me')).user); } catch { setUser(null); }
    setReady(true);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => setOpen(false), [loc.pathname]);

  const toast = useCallback((m: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, m, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3600);
  }, []);
  const logout = () => { setToken(null); setUser(null); nav('/login'); };

  if (!ready) return <div className="page"><div className="empty"><span className="spin" /></div></div>;
  const ctx = { user, refresh, logout, toast };

  return (
    <AppCtx.Provider value={ctx}>
      {user ? (
        <div className="shell">
          {open && <div className="scrim" onClick={() => setOpen(false)} />}
          <aside className={`side ${open ? 'open' : ''}`}>
            <div className="brand"><span className="logo"><Icon name="sparkle" size={18} /></span>MiniGame Studio</div>
            <nav className="nav">
              <NavLink to="/" end><Icon name="home" />Overview</NavLink>
              <NavLink to="/games"><Icon name="grid" />My games</NavLink>
              <NavLink to="/store"><Icon name="store" />Store</NavLink>
              <a href="/docs/" target="_blank" rel="noreferrer"><Icon name="book" />Integration guide<span className="grow" /><Icon name="external" size={14} /></a>
            </nav>
            <div className="side-foot">
              <div className="wallet">
                <small>Demo wallet</small>
                <b>{fmt(user.balance)}</b>
                <Button size="sm" icon="plus" onClick={async () => { await api.post('/api/wallet/topup'); await refresh(); toast('Added 5,000 demo credits'); }}>Top up 5,000</Button>
              </div>
              <div className="nav">
                <button onClick={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} />{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
              </div>
              <div className="user-chip">
                <div className="avatar">{String(user.email[0]).toUpperCase()}</div>
                <div className="grow" style={{ minWidth: 0 }}><div className="small" style={{ fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div></div>
                <button className="btn ghost sm" onClick={logout} title="Sign out"><Icon name="logout" size={16} /></button>
              </div>
            </div>
          </aside>
          <div className="main">
            <div className="mobile-bar">
              <button className="btn ghost sm" onClick={() => setOpen(true)} aria-label="Menu"><Icon name="menu" size={20} /></button>
              <div className="brand" style={{ padding: 0 }}><span className="logo" style={{ width: 28, height: 28, borderRadius: 9 }}><Icon name="sparkle" size={15} /></span>MiniGame Studio</div>
              <span className="grow" />
              <span className="badge brand"><Icon name="coin" size={13} />{fmt(user.balance)}</span>
            </div>
            <main className="page" key={loc.pathname.split('/').slice(0, 3).join('/')}>
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/store" element={<Store />} />
                <Route path="/games" element={<MyGames />} />
                <Route path="/games/:id/*" element={<GameDetail />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </main>
          </div>
        </div>
      ) : (
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      )}
      <div className="toasts">{toasts.map(t => <div key={t.id} className={`toast ${t.kind}`}><Icon name={t.kind === 'err' ? 'x' : 'check'} size={16} />{t.m}</div>)}</div>
    </AppCtx.Provider>
  );
}
