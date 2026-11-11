import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../App';
import { Badge, Button, Card, Empty, Icon, PageHead, Skeleton } from '../ui';
import Studio from './Studio';
import PlayersTab from './Players';
import { Snippets } from './Integrate';

export default function GameDetail() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => { try { setData(await api.get(`/api/licenses/${id}`)); } catch (e: any) { setErr(e.message); } }, [id]);
  useEffect(() => { setData(null); setErr(''); load(); }, [load]);

  if (err) return <Card><Empty icon="info" title={err} action={<a href="/games"><Button>Back to my games</Button></a>} /></Card>;
  if (!data) return <div className="stack"><Skeleton h={34} w={280} /><Skeleton h={420} r={16} /></div>;
  const { license, game } = data;
  return (
    <div>
      <PageHead back={{ to: '/games', label: 'My games' }} title={<>{license.name} <Badge tone="brand">{game.name}</Badge></>} sub={<span className="row" style={{ gap: 8 }}><span className="muted small">Game ID</span><span className="code">{license.gameId}</span><button className="btn ghost sm" onClick={() => { navigator.clipboard?.writeText(license.gameId); }} title="Copy game ID"><Icon name="copy" size={14} /></button></span>} />
      <div className="tabs">
        <NavLink to={`/games/${id}/customize`}><Icon name="palette" size={16} />Customize</NavLink>
        <NavLink to={`/games/${id}/integrate`}><Icon name="plug" size={16} />Integrate</NavLink>
        <NavLink to={`/games/${id}/players`}><Icon name="chart" size={16} />Players &amp; results</NavLink>
        <NavLink to={`/games/${id}/settings`}><Icon name="settings" size={16} />Settings</NavLink>
      </div>
      <Routes>
        <Route path="customize" element={<Studio data={data} />} />
        <Route path="integrate" element={<Integrate data={data} />} />
        <Route path="players" element={<PlayersTab data={data} />} />
        <Route path="settings" element={<Settings data={data} reload={load} />} />
        <Route path="*" element={<Navigate to="customize" replace />} />
      </Routes>
    </div>
  );
}

function Integrate({ data }: { data: any }) {
  const { license } = data;
  const { user } = useApp();
  const open = async () => { const r = await api.post(`/api/licenses/${license.id}/preview-session`); window.open(r.playUrl, '_blank'); };
  return (
    <div className="stack">
      <Card>
        <h2 style={{ marginBottom: 16 }}>How it works</h2>
        <div className="stack">
          <div className="step"><div className="n">1</div><div><b>Your server creates a session</b><p className="muted">It calls our API with your account <b>API key</b> and this game&apos;s <b>ID</b>, and receives a play link that expires in 15 minutes.</p></div></div>
          <div className="step"><div className="n">2</div><div><b>Your site or app shows the game</b><p className="muted">Load the link in an iframe (website) or a WebView (Flutter, Android, iOS). The player picks a username and plays.</p></div></div>
          <div className="step"><div className="n">3</div><div><b>You watch the results</b><p className="muted">Players, bets and payouts appear live under <i>Players &amp; results</i>. The API key never reaches a player.</p></div></div>
        </div>
        <div className="row wrap" style={{ marginTop: 18 }}>
          <Button icon="play" onClick={open}>Try the game in a new tab</Button>
          <a href="/docs/" target="_blank" rel="noreferrer"><Button variant="ghost" icon="book">Full integration guide</Button></a>
          <Link to="/api-key"><Button variant="ghost" icon="key">{user?.hasApiKey ? 'Manage API key' : 'Create your API key'}</Button></Link>
        </div>
      </Card>
      <Snippets baseUrl={location.origin} gameId={license.gameId} />
    </div>
  );
}

function Settings({ data, reload }: { data: any; reload: () => void }) {
  const { license } = data;
  const { toast } = useApp();
  const [name, setName] = useState(license.name);
  const [origins, setOrigins] = useState<string[]>(license.allowedOrigins);
  const [draft, setDraft] = useState('');

  const addOrigin = () => { const v = draft.trim().replace(/\/$/, ''); if (!v) return; if (!/^https?:\/\/[\w.-]+(:\d+)?$/.test(v)) { toast('Use the form https://example.com (no path)', 'err'); return; } if (!origins.includes(v)) setOrigins([...origins, v]); setDraft(''); };
  const save = async () => { try { await api.put(`/api/licenses/${license.id}`, { name, allowedOrigins: origins }); toast('Settings saved'); reload(); } catch (e: any) { toast(e.message, 'err'); } };

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <Card>
        <h2 style={{ marginBottom: 14 }}>General</h2>
        <label className="lbl">Name (only you see this)</label>
        <input value={name} maxLength={40} onChange={e => setName(e.target.value)} />
        <div style={{ height: 18 }} />
        <label className="lbl">Allowed websites <Badge>optional</Badge></label>
        <div className="row"><input placeholder="https://www.yoursite.com" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addOrigin())} /><Button onClick={addOrigin}>Add</Button></div>
        <div className="help">When you add sites, browsers will refuse to show the game anywhere else. Mobile WebViews are not affected. Leave empty to allow any site.</div>
        {origins.length > 0 && <div className="chips" style={{ marginTop: 12 }}>{origins.map(o => <span className="chip" key={o}>{o}<button onClick={() => setOrigins(origins.filter(x => x !== o))} aria-label="Remove"><Icon name="x" size={12} /></button></span>)}</div>}
        <div style={{ marginTop: 18 }}><Button variant="primary" icon="check" onClick={save}>Save settings</Button></div>
      </Card>
    </div>
  );
}
