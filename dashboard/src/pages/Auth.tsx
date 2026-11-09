import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setToken } from '../api';
import { useApp } from '../App';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { refresh } = useApp();
  const nav = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await api.post(`/api/auth/${mode}`, { email, password });
      setToken(r.token); await refresh(); nav('/');
    } catch (x: any) { setErr(x.message); }
    setBusy(false);
  };

  return (
    <div className="auth">
      <div className="auth-hero">
        <div className="logo big">♦</div>
        <h1>MiniGame Studio</h1>
        <p>Buy ready-made, animated mini games. Make them yours with your own images, prizes and currency. Drop them into any website or app with one license key.</p>
        <ul>
          <li>🎡 Lucky Spin &nbsp; 🎰 Lucky 77 &nbsp; 🎲 Ludo</li>
          <li>🔑 Secret license key, safe server-to-server sessions</li>
          <li>📊 See your players and their results live</li>
        </ul>
      </div>
      <form className="card auth-card" onSubmit={submit}>
        <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        {mode === 'register' && <p className="muted">You start with <b>10,000 demo credits</b> to buy games.</p>}
        <label>Email<input type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" /></label>
        <label>Password<input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <p className="muted center-text">
          {mode === 'login' ? <>New here? <Link to="/register">Create an account</Link></> : <>Already have an account? <Link to="/login">Sign in</Link></>}
        </p>
      </form>
    </div>
  );
}
