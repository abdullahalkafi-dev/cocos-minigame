'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, fmt } from '@/lib/api';
import { useApp } from '@/features/auth/auth-context';
import { Button, Icon, useTheme } from '@/components/ui';

const NAV = [
  { href: '/', label: 'Overview', icon: 'home', match: (p: string) => p === '/' },
  { href: '/games', label: 'My games', icon: 'grid', match: (p: string) => p === '/games' || p === '/game' },
  { href: '/store', label: 'Store', icon: 'store', match: (p: string) => p === '/store' },
  { href: '/api-key', label: 'API key & webhooks', icon: 'key', match: (p: string) => p === '/api-key' },
];

/** Signed-in layout: sidebar, mobile bar and the page. Redirects to the login page when nobody is signed in. */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, ready, refresh, logout, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  useEffect(() => setOpen(false), [pathname]);

  if (!ready || !user) return <div className="page"><div className="empty"><span className="spin" /></div></div>;

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`side ${open ? 'open' : ''}`}>
        <div className="brand"><span className="logo"><Icon name="sparkle" size={18} /></span>MiniGame Studio</div>
        <nav className="nav">
          {NAV.map(n => <Link key={n.href} href={n.href} className={n.match(pathname) ? 'active' : ''}><Icon name={n.icon} />{n.label}</Link>)}
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
        <main className="page" key={pathname}>{children}</main>
      </div>
    </div>
  );
}
