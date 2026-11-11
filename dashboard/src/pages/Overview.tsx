import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../App';
import { Badge, Button, Card, Empty, Icon, PageHead, Skeleton } from '../ui';

export default function Overview() {
  const { user } = useApp();
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => { api.get('/api/licenses').then(r => setList(r.licenses)); }, []);
  const tot = (list ?? []).reduce((a, l) => ({ players: a.players + l.stats.players, rounds: a.rounds + l.stats.rounds, bet: a.bet + l.stats.bet, win: a.win + l.stats.win }), { players: 0, rounds: 0, bet: 0, win: 0 });

  return (
    <div className="stack">
      <PageHead title={`Welcome back${user?.email ? ', ' + user.email.split('@')[0] : ''}`} sub="Here is how your games are doing." actions={<Link to="/store"><Button variant="primary" icon="plus">Buy a game</Button></Link>} />
      {list === null ? <div className="stat-row">{[1, 2, 3, 4].map(i => <Card key={i} className="stat"><Skeleton h={14} w={90} /><Skeleton h={28} w={120} /></Card>)}</div> : (
        <div className="stat-row">
          <Card className="stat"><div className="ic"><Icon name="grid" size={17} /></div><span>Games</span><b>{fmt(list.length)}</b></Card>
          <Card className="stat"><div className="ic"><Icon name="users" size={17} /></div><span>Players</span><b>{fmt(tot.players)}</b></Card>
          <Card className="stat"><div className="ic"><Icon name="chart" size={17} /></div><span>Rounds played</span><b>{fmt(tot.rounds)}</b></Card>
          <Card className="stat"><div className="ic"><Icon name="coin" size={17} /></div><span>Total wagered</span><b>{fmt(tot.bet)}</b></Card>
        </div>
      )}
      <div className="quick">
        <Link to="/store"><span className="ic"><Icon name="store" /></span><div><b>Browse the store</b><div className="muted small">Get a new game and key</div></div></Link>
        <Link to="/games"><span className="ic"><Icon name="palette" /></span><div><b>Customize a game</b><div className="muted small">Swap images, video, sound</div></div></Link>
        <a href="/docs/" target="_blank" rel="noreferrer"><span className="ic"><Icon name="plug" /></span><div><b>Integration guide</b><div className="muted small">Website, Flutter, any app</div></div></a>
      </div>
      <Card>
        <div className="row between" style={{ marginBottom: 14 }}><h2>Your games</h2><Link to="/games" className="small">View all</Link></div>
        {list === null ? <Skeleton h={70} /> : list.length === 0 ? (
          <Empty title="No games yet" text="Buy Lucky Wheel 77 to get your first license key. It takes a few seconds." action={<Link to="/store"><Button variant="primary">Open the store</Button></Link>} />
        ) : (
          <div className="stack-sm">{list.slice(0, 4).map(l => (
            <Link key={l.id} to={`/games/${l.id}`} className="row" style={{ padding: 12, border: '1px solid var(--line)', borderRadius: 14, color: 'var(--text)' }}>
              <div className="avatar" style={{ borderRadius: 12 }}><Icon name="play" size={16} /></div>
              <div className="grow"><b>{l.name}</b><div className="muted small mono">{l.keyPrefix}••••••••</div></div>
              <Badge tone="brand">{fmt(l.stats.players)} players</Badge><Badge>{fmt(l.stats.rounds)} rounds</Badge><Icon name="arrow" size={16} />
            </Link>))}</div>
        )}
      </Card>
    </div>
  );
}
