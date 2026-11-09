import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ago, fmt } from '../api';
import { useApp } from '../App';

export default function PlayersTab({ data }: { data: any }) {
  const id = data.license.id;
  const { toast } = useApp();
  const [stats, setStats] = useState<any>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: 'last_seen', dir: -1 });
  const [live, setLive] = useState(true);
  const [playerFilter, setPlayerFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, p, r] = await Promise.all([
        api.get(`/api/licenses/${id}/stats`), api.get(`/api/licenses/${id}/players`),
        api.get(`/api/licenses/${id}/rounds?limit=40${playerFilter ? `&player=${encodeURIComponent(playerFilter)}` : ''}`),
      ]);
      setStats(s); setPlayers(p.players); setRounds(r.rounds);
    } catch {}
  }, [id, playerFilter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!live) return; const t = setInterval(load, 5000); return () => clearInterval(t); }, [live, load]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return players.filter(p => !f || p.username.toLowerCase().includes(f))
      .sort((a, b) => ((a[sort.k] > b[sort.k] ? 1 : a[sort.k] < b[sort.k] ? -1 : 0) * sort.dir));
  }, [players, filter, sort]);
  const th = (k: string, label: string) => (
    <th className="sortable" onClick={() => setSort(s => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : -1 }))}>{label}{sort.k === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</th>
  );
  const exp = (kind: string) => api.download(`/api/licenses/${id}/export.csv?kind=${kind}`, `${kind}.csv`).catch(e => toast(e.message, 'err'));

  if (!stats) return <div className="muted">Loading…</div>;
  const t = stats.totals;
  const maxDay = Math.max(1, ...stats.daily.map((d: any) => d.rounds));
  return (
    <div className="stack">
      <div className="stat-row">
        <Stat label="Players" value={fmt(t.players)} />
        <Stat label="Rounds played" value={fmt(t.rounds)} />
        <Stat label="Total wagered" value={fmt(t.bet)} />
        <Stat label="Total paid out" value={fmt(t.win)} />
        <Stat label="Payout rate" value={t.bet ? `${(t.rtp * 100).toFixed(1)}%` : '–'} />
      </div>

      <div className="two">
        <section className="card">
          <h3>Rounds per day</h3>
          {stats.daily.length === 0 ? <p className="muted">No rounds yet. Share your game and results appear here live.</p> : (
            <div className="bars">{stats.daily.map((d: any) => (
              <div className="bar" key={d.day} title={`${d.day}: ${d.rounds} rounds`}>
                <div className="fill" style={{ height: `${(d.rounds / maxDay) * 100}%` }} /><span>{d.day.slice(5)}</span>
              </div>))}</div>
          )}
        </section>
        <section className="card">
          <h3>Top winners</h3>
          {stats.topWinners.length === 0 ? <p className="muted">No winners yet.</p> : (
            <ol className="winners">{stats.topWinners.map((w: any, i: number) => (
              <li key={w.username}><span className="rank">{i + 1}</span><b>{w.username}</b><span className="grow" /><span className="pos">+{fmt(w.win)}</span></li>))}</ol>
          )}
        </section>
      </div>

      <section className="card">
        <div className="row between wrap"><h3>Players</h3>
          <div className="row"><input className="search" placeholder="Search username…" value={filter} onChange={e => setFilter(e.target.value)} />
            <button className="btn sm" onClick={() => exp('players')}>⬇ CSV</button></div></div>
        {shown.length === 0 ? <p className="muted">No players yet.</p> : (
          <div className="table-wrap"><table>
            <thead><tr>{th('username', 'Username')}{th('balance', 'Balance')}{th('rounds', 'Rounds')}{th('totalBet', 'Wagered')}{th('totalWin', 'Won')}{th('last_seen', 'Last seen')}<th /></tr></thead>
            <tbody>{shown.map(p => (
              <tr key={p.id}><td><b>{p.username}</b></td><td>{fmt(p.balance)}</td><td>{fmt(p.rounds)}</td><td>{fmt(p.totalBet)}</td>
                <td className={p.totalWin >= p.totalBet ? 'pos' : ''}>{fmt(p.totalWin)}</td><td className="muted">{ago(p.last_seen)}</td>
                <td><button className="btn ghost sm" onClick={() => setPlayerFilter(playerFilter === p.username ? '' : p.username)}>{playerFilter === p.username ? 'Clear' : 'History'}</button></td></tr>))}</tbody>
          </table></div>
        )}
      </section>

      <section className="card">
        <div className="row between wrap"><h3>Results feed {playerFilter && <span className="pill">{playerFilter}</span>}</h3>
          <div className="row"><label className="check"><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /> Live</label>
            <button className="btn sm" onClick={() => exp('rounds')}>⬇ CSV</button></div></div>
        {rounds.length === 0 ? <p className="muted">No rounds yet.</p> : (
          <div className="table-wrap"><table>
            <thead><tr><th>When</th><th>Player</th><th>Result</th><th>Bet</th><th>Won</th></tr></thead>
            <tbody>{rounds.map(r => (
              <tr key={r.id}><td className="muted">{ago(r.created_at)}</td><td><b>{r.username}</b></td><td>{r.outcome.summary}</td><td>{fmt(r.bet)}</td>
                <td className={r.win > 0 ? 'pos' : 'muted'}>{r.win > 0 ? `+${fmt(r.win)}` : '0'}</td></tr>))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
const Stat = ({ label, value }: { label: string; value: string }) => <div className="card stat"><span>{label}</span><b>{value}</b></div>;
