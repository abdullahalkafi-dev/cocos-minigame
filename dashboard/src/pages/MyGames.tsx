import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api';
import { Badge, Button, Card, Empty, Icon, PageHead, Skeleton } from '../ui';

export default function MyGames() {
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => { api.get('/api/licenses').then(r => setList(r.licenses)); }, []);
  return (
    <div className="stack">
      <PageHead title="My games" sub="Every game has its own key, look and player list." actions={<Link to="/store"><Button icon="plus">Buy another</Button></Link>} />
      {list === null ? <div className="grid-cards">{[1, 2].map(i => <Card key={i}><Skeleton h={150} /></Card>)}</div> : list.length === 0 ? (
        <Card><Empty icon="grid" title="No games yet" text="Pick a game in the store to get your first license key." action={<Link to="/store"><Button variant="primary">Open the store</Button></Link>} /></Card>
      ) : (
        <div className="grid-cards">{list.map(l => l.retired ? (
          <div className="card game-tile" key={l.id} style={{ opacity: .6 }}>
            <div className="body"><div className="row between"><h3>{l.name}</h3><Badge tone="warn">Retired</Badge></div>
              <p className="muted small">This game is no longer offered. Your data is kept ({fmt(l.stats.rounds)} rounds, {fmt(l.stats.players)} players).</p></div>
          </div>
        ) : (
          <Link to={`/games/${l.id}`} className="card game-tile" key={l.id}>
            <div className="art"><img src="/defaults/lucky-wheel/wheel-frame.webp" alt="" /></div>
            <div className="body">
              <div className="row between"><h3>{l.name}</h3><Badge tone={l.status === 'active' ? 'good' : 'warn'}>{l.status}</Badge></div>
              <div className="muted small mono"><Icon name="key" size={12} /> {l.keyPrefix}••••••••</div>
              <div className="mini-stats">
                <div><b>{fmt(l.stats.players)}</b><span>players</span></div>
                <div><b>{fmt(l.stats.rounds)}</b><span>rounds</span></div>
                <div><b>{fmt(l.stats.win)}</b><span>paid out</span></div>
              </div>
            </div>
          </Link>))}</div>
      )}
    </div>
  );
}
