'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';
import { useApp } from '@/features/auth/auth-context';
import { Button, Icon } from '@/components/ui';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { refresh, ready, user } = useApp();
  const submitted = useRef(false);
  const router = useRouter();
  // somebody who is already signed in has no business on the login page
  useEffect(() => { if (ready && user && !submitted.current) router.replace('/'); }, [ready, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); submitted.current = true; setErr(''); setBusy(true);
    try {
      const r = await api.post(`/api/auth/${mode}`, { email, password });
      setToken(r.token); await refresh();
      // a new account gets its API key right away (shown once)
      if (r.apiKey) { try { sessionStorage.setItem('mgs_new_key', r.apiKey); } catch { /* ignore */ } router.push('/api-key'); } else router.push('/');
    }
    catch (x: any) { setErr(x.message); }
    setBusy(false);
  };

  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="brand" style={{ padding: 0, color: '#fff' }}><span className="logo"><Icon name="sparkle" size={18} /></span>MiniGame Studio</div>
        <h1>Ship a polished mini game in minutes.</h1>
        <p>Buy a ready-made, animated game, replace every image, video and sound with your own, and drop it into any website or app with one secret key.</p>
        <div className="feat">
          <div><span className="ic"><Icon name="palette" size={15} /></span>Every asset is a slot: image, SVG, video, sound</div>
          <div><span className="ic"><Icon name="key" size={15} /></span>One API key for all your games</div>
          <div><span className="ic"><Icon name="chart" size={15} /></span>Live players, bets and results dashboard</div>
        </div>
        <img className="wheel" src="/defaults/lucky-wheel/wheel-frame.webp" alt="" />
      </div>
      <form className="card auth-card" onSubmit={submit}>
        <div><h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="muted" style={{ marginTop: 4 }}>{mode === 'register' ? <>You start with <b>10,000 demo credits</b> to buy games.</> : 'Sign in to manage your games.'}</p></div>
        <div><label className="lbl">Email</label><input type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" /></div>
        <div><label className="lbl">Password</label><input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /></div>
        {err && <div className="badge bad" style={{ padding: '10px 12px', borderRadius: 10, whiteSpace: 'normal' }}>{err}</div>}
        <Button variant="primary" size="lg" loading={busy}>{mode === 'login' ? 'Sign in' : 'Create account'}</Button>
        <p className="muted small" style={{ textAlign: 'center' }}>
          {mode === 'login' ? <>New here? <Link href="/register">Create an account</Link></> : <>Already registered? <Link href="/login">Sign in</Link></>}
        </p>
      </form>
    </div>
  );
}
