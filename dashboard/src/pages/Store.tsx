import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, copy, fmt } from '../api';
import { Modal, useApp } from '../App';

const ART: Record<string, { emoji: string; grad: string }> = {
  'lucky-spin': { emoji: '🎡', grad: 'linear-gradient(135deg,#7c3aed,#f59e0b)' },
  'lucky-77': { emoji: '🎰', grad: 'linear-gradient(135deg,#dc2626,#fbbf24)' },
  ludo: { emoji: '🎲', grad: 'linear-gradient(135deg,#2563eb,#22c55e)' },
};

export default function Store() {
  const [games, setGames] = useState<any[]>([]);
  const [busy, setBusy] = useState('');
  const [bought, setBought] = useState<any>(null);
  const { user, refresh, toast } = useApp();
  const nav = useNavigate();

  useEffect(() => { api.get('/api/store').then(r => setGames(r.games)); }, []);

  const buy = async (g: any) => {
    setBusy(g.slug);
    try { const r = await api.post(`/api/store/${g.slug}/buy`); setBought(r); await refresh(); }
    catch (e: any) { toast(e.message, 'err'); }
    setBusy('');
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Game store</h1><p className="muted">Pay with demo credits. Every purchase gives you its own secret license key and its own customizable copy.</p></div>
      </div>
      <div className="grid cards">
        {games.map(g => (
          <div className="card game-card" key={g.slug}>
            <div className="art" style={{ background: ART[g.slug]?.grad }}><span>{ART[g.slug]?.emoji}</span></div>
            <div className="body">
              <h3>{g.name}</h3>
              <p className="muted">{g.tagline}</p>
              <ul className="tech">{g.tech.map((t: string) => <li key={t}>{t}</li>)}</ul>
              <div className="row between">
                <div className="price"><span className="coin">●</span> {fmt(g.price)}</div>
                <button className="btn primary" disabled={busy === g.slug || user.balance < g.price} onClick={() => buy(g)}>
                  {user.balance < g.price ? 'Not enough credits' : busy === g.slug ? 'Buying…' : 'Buy game'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {bought && (
        <Modal title="🎉 Purchase complete" onClose={() => setBought(null)}>
          <p>Your new game <b>{bought.license.name}</b> is ready. This is your <b>secret license key</b>. <b>Copy it now, it will not be shown again</b> (you can rotate it later).</p>
          <div className="secret">{bought.licenseKey}</div>
          <p className="muted small">Keep it on your server only. Never put it in website JavaScript or inside your mobile app.</p>
          <div className="row end">
            <button className="btn" onClick={async () => { await copy(bought.licenseKey); toast('Key copied'); }}>Copy key</button>
            <button className="btn primary" onClick={() => { const id = bought.license.id; setBought(null); nav(`/games/${id}`); }}>Customize my game →</button>
          </div>
        </Modal>
      )}
    </>
  );
}
