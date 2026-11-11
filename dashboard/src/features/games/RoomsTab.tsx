'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, fmt } from '@/lib/api';
import { useApp } from '@/features/auth/auth-context';
import { Badge, Button, Card, Empty, Icon, Skeleton } from '@/components/ui';

const PERIODS = [['day', 'Today'], ['week', 'This week'], ['month', 'This month'], ['all', 'All time']] as const;
const METRICS = [['winnings', 'Total won'], ['net', 'Net result'], ['wagered', 'Total wagered'], ['biggest_win', 'Biggest win']] as const;

/** Rooms of a game (separate round clocks and pots) and the leaderboard a client can show in its own app. */
export default function RoomsTab({ data }: { data: any }) {
  const id = data.license.id;
  const { toast } = useApp();
  const [rooms, setRooms] = useState<any[] | null>(null);
  const [form, setForm] = useState({ key: '', name: '', capacity: '', auto: true, chips: '', maxPerTarget: '', betSeconds: '' });
  const [busy, setBusy] = useState('');
  const [board, setBoard] = useState<any>(null);
  const [period, setPeriod] = useState<string>('all');
  const [metric, setMetric] = useState<string>('winnings');
  const [room, setRoom] = useState('');

  const load = useCallback(async () => { try { setRooms((await api.get(`/api/licenses/${id}/rooms`)).rooms); } catch (e: any) { toast(e.message, 'err'); } }, [id, toast]);
  const loadBoard = useCallback(async () => {
    try { setBoard(await api.get(`/api/licenses/${id}/leaderboard?period=${period}&metric=${metric}&limit=10${room ? `&room=${encodeURIComponent(room)}` : ''}`)); } catch { setBoard(null); }
  }, [id, period, metric, room]);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  useEffect(() => { loadBoard(); }, [loadBoard]);

  const create = async () => {
    const overrides: any = {};
    const chips = form.chips.split(',').map(s => Number(s.trim())).filter(Boolean);
    if (chips.length) overrides.chips = chips;
    if (form.maxPerTarget) overrides.maxPerTarget = Number(form.maxPerTarget);
    if (form.betSeconds) overrides.timing = { betSeconds: Number(form.betSeconds) };
    setBusy('create');
    try {
      await api.post(`/api/licenses/${id}/rooms`, { key: form.key.trim(), name: form.name.trim() || undefined, capacity: form.capacity ? Number(form.capacity) : null, auto: form.auto, overrides });
      setForm({ key: '', name: '', capacity: '', auto: true, chips: '', maxPerTarget: '', betSeconds: '' });
      toast('Room created'); await load();
    } catch (e: any) { toast(e.message, 'err'); }
    setBusy('');
  };
  const remove = async (key: string) => { try { await api.del(`/api/licenses/${id}/rooms/${encodeURIComponent(key)}`); toast('Room deleted'); await load(); } catch (e: any) { toast(e.message, 'err'); } };
  const setCapacity = async (key: string, v: string) => { try { await api.put(`/api/licenses/${id}/rooms/${encodeURIComponent(key)}`, { capacity: v ? Number(v) : null }); toast('Capacity saved'); await load(); } catch (e: any) { toast(e.message, 'err'); } };

  const f = (k: keyof typeof form) => (e: any) => setForm({ ...form, [k]: k === 'auto' ? e.target.checked : e.target.value });
  return (
    <div className="stack">
      <Card>
        <div className="row between wrap"><h2>Rooms</h2><Badge tone="brand">{rooms ? rooms.reduce((a, r) => a + r.online, 0) : 0} players online</Badge></div>
        <p className="muted small" style={{ marginBottom: 12 }}>A room has its own round clock, pot and ranking. Give the main room a capacity to run small tables: when one is full, players asked for <code>room: &quot;auto&quot;</code> are placed in a new copy. Create named rooms (a VIP table with bigger chips, for example) and send the room key when your server creates a session.</p>
        {rooms === null ? <Skeleton h={110} /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Room</th><th>Online</th><th>Capacity</th><th>Auto</th><th>Preset</th><th /></tr></thead>
            <tbody>{rooms.map(r => (
              <tr key={r.key}><td><b>{r.name}</b><div className="muted small mono">{r.key}</div></td><td>{fmt(r.online)}</td>
                <td><input style={{ width: 90 }} defaultValue={r.capacity ?? ''} placeholder="no limit" onBlur={e => { if ((e.target.value || null) !== (r.capacity === null ? null : String(r.capacity))) setCapacity(r.key, e.target.value); }} /></td>
                <td>{r.auto ? <Badge tone="good">yes</Badge> : <Badge>no</Badge>}</td>
                <td className="muted small">{[r.overrides.chips && `chips ${r.overrides.chips.map((c: number) => fmt(c)).join('/')}`, r.overrides.maxPerTarget && `max ${fmt(r.overrides.maxPerTarget)}`, r.overrides.timing?.betSeconds && `${r.overrides.timing.betSeconds}s betting`].filter(Boolean).join(' · ') || 'game defaults'}</td>
                <td>{r.key !== 'main' && <Button size="sm" variant="ghost" onClick={() => remove(r.key)}>Delete</Button>}</td></tr>))}</tbody>
          </table></div>)}
      </Card>

      <Card className="stack-sm">
        <h2>New room</h2>
        <div className="grid2">
          <div><label className="lbl">Key (used by your server)</label><input placeholder="vip" value={form.key} onChange={f('key')} /></div>
          <div><label className="lbl">Name</label><input placeholder="VIP table" value={form.name} onChange={f('name')} /></div>
          <div><label className="lbl">Capacity <Badge>optional</Badge></label><input placeholder="e.g. 50" value={form.capacity} onChange={f('capacity')} /></div>
          <div><label className="lbl">Chip values <Badge>optional</Badge></label><input placeholder="100000, 500000, 1000000" value={form.chips} onChange={f('chips')} /></div>
          <div><label className="lbl">Max bet per option <Badge>optional</Badge></label><input placeholder="2000000" value={form.maxPerTarget} onChange={f('maxPerTarget')} /></div>
          <div><label className="lbl">Betting seconds <Badge>optional</Badge></label><input placeholder="20" value={form.betSeconds} onChange={f('betSeconds')} /></div>
        </div>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={form.auto} onChange={f('auto')} style={{ width: 'auto' }} /> Include in automatic placement</label>
        <div><Button variant="primary" icon="plus" onClick={create} loading={busy === 'create'} disabled={!form.key.trim()}>Create room</Button></div>
      </Card>

      <Card className="stack-sm">
        <div className="row between wrap"><h2>Leaderboard</h2>
          <div className="row wrap">
            <select value={room} onChange={e => setRoom(e.target.value)}><option value="">All rooms</option>{(rooms ?? []).map(r => <option key={r.key} value={r.key}>{r.name}</option>)}</select>
            <select value={period} onChange={e => setPeriod(e.target.value)}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <select value={metric} onChange={e => setMetric(e.target.value)}>{METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div></div>
        <p className="muted small">Your app can show the same ranking with <span className="code">GET /api/v1/games/{id}/leaderboard</span>.</p>
        {!board || board.entries.length === 0 ? <Empty icon="chart" title="No results yet" text="The ranking fills as players finish rounds." /> : (
          <div className="stack-sm">{board.entries.map((e: any) => (
            <div className="row" key={e.rank + String(e.playerId)}><span className="rank">{e.rank}</span><b>{e.displayName ?? e.playerId}</b>{e.displayName !== e.playerId && <span className="muted small mono">{e.playerId}</span>}<span className="grow" /><span className={e.value >= 0 ? 'pos' : ''}>{fmt(e.value)}</span><span className="muted small">{fmt(e.rounds)} rounds</span></div>))}</div>)}
      </Card>
      <p className="muted small"><Icon name="info" size={13} /> Capacity is a soft limit: a few extra players can slip in while many sessions are created at the same moment.</p>
    </div>
  );
}
