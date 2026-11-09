import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api';

const EMOJI: Record<string, string> = { 'lucky-spin': '🎡', 'lucky-77': '🎰', ludo: '🎲' };

export default function MyGames() {
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => { api.get('/api/licenses').then(r => setList(r.licenses)); }, []);
  if (!list) return <div className="muted">Loading…</div>;
  return (
    <>
      <div className="page-head"><div><h1>My games</h1><p className="muted">Each game has its own key, look and player list.</p></div></div>
      {list.length === 0 ? (
        <div className="card empty"><h3>No games yet</h3><p className="muted">Pick a game in the store to get your first license key.</p><Link className="btn primary" to="/">Open the store</Link></div>
      ) : (
        <div className="grid cards">
          {list.map(l => (
            <Link to={`/games/${l.id}`} className="card game-link" key={l.id}>
              <div className="row between"><div className="emoji">{EMOJI[l.game]}</div><span className="pill ok">{l.status}</span></div>
              <h3>{l.name}</h3>
              <div className="muted small mono">{l.keyPrefix}••••••••</div>
              <div className="mini-stats">
                <div><b>{fmt(l.stats.players)}</b><span>players</span></div>
                <div><b>{fmt(l.stats.rounds)}</b><span>rounds</span></div>
                <div><b>{fmt(l.stats.win)}</b><span>paid out</span></div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
