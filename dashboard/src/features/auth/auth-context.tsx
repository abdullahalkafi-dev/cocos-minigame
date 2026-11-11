'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, getToken, setToken } from '@/lib/api';
import { Icon } from '@/components/ui';

interface Ctx {
  /** The signed-in buyer, or null. */
  user: any;
  /** False until the first "who am I" answer arrived (avoids flashing the login page). */
  ready: boolean;
  refresh: () => Promise<void>;
  logout: () => void;
  toast: (message: string, kind?: 'ok' | 'err') => void;
}
const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

/** Session state shared by every page: the signed-in buyer and the toast messages. */
export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; m: string; kind: string }[]>([]);
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setReady(true); return; }
    try { setUser((await api.get('/api/me')).user); } catch { setUser(null); }
    setReady(true);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const toast = useCallback((m: string, kind: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, m, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3600);
  }, []);
  const logout = useCallback(() => { setToken(null); setUser(null); router.push('/login'); }, [router]);

  return (
    <AppCtx.Provider value={{ user, ready, refresh, logout, toast }}>
      {children}
      <div className="toasts">{toasts.map(t => <div key={t.id} className={`toast ${t.kind}`}><Icon name={t.kind === 'err' ? 'x' : 'check'} size={16} />{t.m}</div>)}</div>
    </AppCtx.Provider>
  );
}
