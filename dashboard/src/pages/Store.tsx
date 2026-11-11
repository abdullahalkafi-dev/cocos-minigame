import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, copy, fmt } from '../api';
import { useApp } from '../App';
import { Badge, Button, Card, Icon, Modal, PageHead, Skeleton } from '../ui';

export default function Store() {
  const [games, setGames] = useState<any[] | null>(null);
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
    <div className="stack">
      <PageHead title="Game store" sub="Each purchase gives you its own secret license key and its own fully customizable copy." />
      {games === null ? <Card><Skeleton h={300} /></Card> : games.map(g => (
        <Card key={g.slug} className="hero-card">
          <div className="hero-art"><div className="phone-mock"><img src="/defaults/lucky-wheel/preview.webp" alt={g.name} /></div></div>
          <div className="hero-body">
            <div className="row"><Badge tone="brand"><Icon name="sparkle" size={12} />Live multiplayer rounds</Badge><Badge tone="good">Ready to embed</Badge></div>
            <div><h1>{g.name}</h1><p className="muted" style={{ marginTop: 6 }}>{g.tagline}</p></div>
            <ul className="checks">{g.tech.map((t: string) => <li key={t}><span className="ok"><Icon name="check" size={12} stroke={2.6} /></span><span>{t}</span></li>)}</ul>
            <div className="row between wrap" style={{ marginTop: 6 }}>
              <div className="price"><Icon name="coin" size={24} />{fmt(g.price)}<span className="muted small" style={{ fontWeight: 600 }}>demo credits</span></div>
              <Button variant="primary" size="lg" icon="key" loading={busy === g.slug} disabled={user.balance < g.price} onClick={() => buy(g)}>
                {user.balance < g.price ? 'Not enough credits' : 'Buy and get my key'}
              </Button>
            </div>
          </div>
        </Card>
      ))}
      {bought && (
        <Modal title="Purchase complete" onClose={() => setBought(null)}>
          <p>Your game <b>{bought.license.name}</b> is ready. This is your <b>secret license key</b>. Copy it now, it will not be shown again. (You can rotate it later.)</p>
          <div className="secret">{bought.licenseKey}</div>
          <p className="muted small">Keep it on your server only. Never place it in website JavaScript or inside a mobile app.</p>
          <div className="row end">
            <Button icon="copy" onClick={async () => { await copy(bought.licenseKey); toast('Key copied'); }}>Copy key</Button>
            <Button variant="primary" icon="palette" onClick={() => { const id = bought.license.id; setBought(null); nav(`/games/${id}`); }}>Customize my game</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
