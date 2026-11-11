'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ago, fmt } from '@/lib/api';
import { useApp } from '@/features/auth/auth-context';
import { Button, Card, Empty, Icon, Skeleton, Switch } from '@/components/ui';
import PlayerLedgerModal from './PlayerLedgerModal';

export default function PlayersTab({ data }: { data: any }) {
  const id = data.license.id;
  const { toast } = useApp();
  const [stats, setStats] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: 'last_seen', dir: -1 });
  const [live, setLive] = useState(true);
  const [who, setWho] = useState('');                       // player id the results feed is filtered by
  const [coins, setCoins] = useState<any>(null);              // player whose coin history is open

  const load = useCallback(async () => {
    try {
      const [s, p, r] = await Promise.all([
        api.get(`/api/licenses/${id}/stats`), api.get(`/api/licenses/${id}/players`),
        api.get(`/api/licenses/${id}/rounds?limit=40${who ? `&player=${encodeURIComponent(who)}` : ''}`),
      ]);
      setStats(s); setPlayers(p.players); setRounds(r.rounds);
    } catch { /* keep the last data */ }
  }, [id, who]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!live) return; const t = setInterval(load, 5000); return () => clearInterval(t); }, [live, load]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return players.filter(p => !f || p.username.toLowerCase().includes(f) || String(p.playerId).toLowerCase().includes(f)).sort((a, b) => (a[sort.k] > b[sort.k] ? 1 : a[sort.k] < b[sort.k] ? -1 : 0) * sort.dir);
  }, [players, filter, sort]);
  const th = (k: string, label: string) => <th className="sortable" onClick={() => setSort(s => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : -1 }))}>{label}{sort.k === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</th>;
  const exp = (kind: string) => api.download(`/api/licenses/${id}/export.csv?kind=${kind}`, `${kind}.csv`).catch(e => toast(e.message, 'err'));

  if (!stats) return <div className="stack"><div className="stat-row">{[1, 2, 3, 4, 5].map(i => <Card key={i} className="stat"><Skeleton h={14} w={80} /><Skeleton h={28} w={110} /></Card>)}</div><Skeleton h={220} r={16} /></div>;
  const t = stats.totals, maxDay = Math.max(1, ...stats.daily.map((d: any) => d.rounds));
  const S = ({ icon, label, value }: any) => <Card className="stat"><div className="ic"><Icon name={icon} size={17} /></div><span>{label}</span><b>{value}</b></Card>;
  return (
    <div className="stack">
      <div className="stat-row">
        <S icon="users" label="Players" value={fmt(t.players)} /><S icon="chart" label="Rounds played" value={fmt(t.rounds)} />
        <S icon="coin" label="Total wagered" value={fmt(t.bet)} /><S icon="coin" label="Total paid out" value={fmt(t.win)} />
        <S icon="sparkle" label="Payout rate" value={t.bet ? `${(t.rtp * 100).toFixed(1)}%` : '–'} />
      </div>
      <div className="two">
        <Card><h2 style={{ marginBottom: 14 }}>Rounds per day</h2>
          {stats.daily.length === 0 ? <p className="muted">No rounds yet. Share your game and results appear here live.</p> : (
            <div className="bars">{stats.daily.map((d: any) => <div className="bar" key={d.day} title={`${d.day}: ${d.rounds} rounds`}><div className="fill" style={{ height: `${(d.rounds / maxDay) * 100}%` }} /><span>{d.day.slice(5)}</span></div>)}</div>)}
        </Card>
        <Card><h2 style={{ marginBottom: 14 }}>Top winners</h2>
          {stats.topWinners.length === 0 ? <p className="muted">No winners yet.</p> : (
            <div className="stack-sm">{stats.topWinners.map((w: any, i: number) => <div className="row" key={w.username}><span className="rank">{i + 1}</span><b>{w.username}</b><span className="grow" /><span className="pos">+{fmt(w.win)}</span></div>)}</div>)}
        </Card>
      </div>
      <Card>
        <div className="row between wrap" style={{ marginBottom: 8 }}><h2>Players</h2>
          <div className="row"><input className="search" placeholder="Search name or id…" value={filter} onChange={e => setFilter(e.target.value)} /><Button size="sm" icon="upload" onClick={() => exp('players')}>CSV</Button></div></div>
        {shown.length === 0 ? <Empty icon="users" title="No players yet" text="Players appear here as soon as your server creates a session for them." /> : (
          <div className="table-wrap"><table>
            <thead><tr>{th('username', 'Player')}{th('balance', 'Balance')}{th('rounds', 'Rounds')}{th('totalBet', 'Wagered')}{th('totalWin', 'Won')}{th('last_seen', 'Last seen')}<th /></tr></thead>
            <tbody>{shown.map(p => (
              <tr key={p.id}><td><div className="row"><div className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>{p.username[0].toUpperCase()}</div><div><b>{p.username}</b>{p.playerId !== p.username && <div className="muted small mono">{p.playerId}</div>}</div></div></td>
                <td>{fmt(p.balance)}</td><td>{fmt(p.rounds)}</td><td>{fmt(p.totalBet)}</td><td className={p.totalWin >= p.totalBet && p.rounds ? 'pos' : ''}>{fmt(p.totalWin)}</td><td className="muted">{ago(p.last_seen)}</td>
                <td><div className="row"><Button size="sm" variant="ghost" onClick={() => setCoins(p)}>Coins</Button><Button size="sm" variant="ghost" onClick={() => setWho(who === p.playerId ? '' : p.playerId)}>{who === p.playerId ? 'Clear' : 'History'}</Button></div></td></tr>))}</tbody>
          </table></div>)}
      </Card>
      <Card>
        <div className="row between wrap" style={{ marginBottom: 8 }}><h2>Results feed {who && <span className="badge brand" style={{ marginLeft: 8 }}>{who}</span>}</h2>
          <div className="row"><Switch checked={live} onChange={setLive} label="Live" /><Button size="sm" icon="upload" onClick={() => exp('rounds')}>CSV</Button></div></div>
        {rounds.length === 0 ? <Empty icon="chart" title="No rounds yet" text="Every settled round and its payout will be listed here." /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>When</th><th>Player</th><th>Result</th><th>Bet</th><th>Won</th></tr></thead>
            <tbody>{rounds.map(r => <tr key={r.id}><td className="muted">{ago(r.created_at)}</td><td><b>{r.username}</b></td><td style={{ whiteSpace: 'normal' }}>{r.outcome.summary}</td><td>{fmt(r.bet)}</td><td className={r.win > 0 ? 'pos' : 'muted'}>{r.win > 0 ? `+${fmt(r.win)}` : '0'}</td></tr>)}</tbody>
          </table></div>)}
      </Card>
      {coins && <PlayerLedgerModal gameId={id} player={coins} onClose={() => setCoins(null)} />}
    </div>
  );
}
