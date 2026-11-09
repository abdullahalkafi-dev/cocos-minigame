import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Snippets } from './Integrate';
import { api, getPath, setPath } from '../api';
import { useApp, Modal } from '../App';
import { FieldInput } from '../components/FieldEditor';
import PlayersTab from './Players';

export default function GameDetail() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try { setData(await api.get(`/api/licenses/${id}`)); } catch (e: any) { setErr(e.message); }
  }, [id]);
  useEffect(() => { setData(null); load(); }, [load]);

  if (err) return <div className="card empty"><h3>{err}</h3><Link className="btn" to="/games">Back to my games</Link></div>;
  if (!data) return <div className="muted">Loading…</div>;
  const { license, game } = data;
  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/games" className="muted small">← My games</Link>
          <h1>{license.name} <span className="pill">{game.name}</span></h1>
        </div>
      </div>
      <div className="tabs">
        <NavLink to={`/games/${id}/customize`}>🎨 Customize</NavLink>
        <NavLink to={`/games/${id}/integrate`}>🔌 Integrate</NavLink>
        <NavLink to={`/games/${id}/players`}>📊 Players &amp; Results</NavLink>
      </div>
      <Routes>
        <Route path="customize" element={<Customize data={data} />} />
        <Route path="integrate" element={<Integrate data={data} reload={load} />} />
        <Route path="players" element={<PlayersTab data={data} />} />
        <Route path="*" element={<Navigate to="customize" replace />} />
      </Routes>
    </>
  );
}

// ---------------- Customize ----------------
function Customize({ data }: { data: any }) {
  const { license, game } = data;
  const { toast } = useApp();
  const [config, setConfig] = useState<any>(data.config);
  const [saved, setSaved] = useState(JSON.stringify(data.config));
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const dirty = JSON.stringify(config) !== saved;
  const frame = useRef<HTMLIFrameElement>(null);

  const loadPreview = useCallback(async () => {
    const r = await api.post(`/api/licenses/${license.id}/preview-session`);
    setPreviewUrl(r.playUrl);
  }, [license.id]);
  useEffect(() => { loadPreview(); }, [loadPreview]);

  const fields = useMemo(() => game.manifest.flatMap((g: any) => g.fields), [game]);
  const save = async () => {
    setBusy(true);
    try {
      const flat = Object.fromEntries(fields.map((f: any) => [f.key, getPath(config, f.key)]));
      const r = await api.put(`/api/licenses/${license.id}/config`, { config: flat });
      setConfig(r.config); setSaved(JSON.stringify(r.config));
      toast('Saved. Refreshing preview…'); await loadPreview();
    } catch (e: any) { toast(e.message, 'err'); }
    setBusy(false);
  };
  const reset = () => { if (confirm('Reset everything to the game defaults?')) setConfig(data.defaults); };

  return (
    <div className="split">
      <div className="form-col">
        {game.manifest.map((g: any) => (
          <section className="card form-section" key={g.title}>
            <h3>{g.title}</h3>
            {g.fields.map((f: any) => (
              <div className={`field ${f.type === 'list' ? 'wide' : ''}`} key={f.key}>
                <label>{f.label}</label>
                {f.help && <div className="help">{f.help}</div>}
                <FieldInput f={f} licenseId={license.id} value={getPath(config, f.key)} onChange={v => setConfig((c: any) => setPath(c, f.key, v))} />
              </div>
            ))}
          </section>
        ))}
        <div className="savebar">
          <span className={dirty ? 'dirty' : 'muted'}>{dirty ? '● Unsaved changes' : '✓ All changes saved'}</span>
          <div className="row">
            <button className="btn ghost" onClick={reset}>Reset to defaults</button>
            <button className="btn primary" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      </div>
      <aside className="preview-col">
        <div className="phone">
          {previewUrl ? <iframe ref={frame} src={previewUrl} title="Live preview" allow="autoplay; fullscreen" /> : <div className="center muted">Loading preview…</div>}
        </div>
        <div className="row center-row">
          <button className="btn sm" onClick={loadPreview}>↻ Reload preview</button>
          <a className="btn sm ghost" href={previewUrl} target="_blank" rel="noreferrer">Open full size ↗</a>
        </div>
        <p className="muted small center-text">The preview shows your <b>saved</b> settings. Preview players are not counted in your stats.</p>
      </aside>
    </div>
  );
}

// ---------------- Integrate ----------------
function Integrate({ data, reload }: { data: any; reload: () => void }) {
  const { license } = data;
  const { toast } = useApp();
  const [newKey, setNewKey] = useState('');
  const [origins, setOrigins] = useState((license.allowedOrigins as string[]).join('\n'));
  const [name, setName] = useState(license.name);

  const rotate = async () => {
    if (!confirm('Rotate the key? Your current key stops working immediately, so update your server right after.')) return;
    try { setNewKey((await api.post(`/api/licenses/${license.id}/rotate-key`)).licenseKey); reload(); } catch (e: any) { toast(e.message, 'err'); }
  };
  const saveMeta = async () => {
    try {
      await api.put(`/api/licenses/${license.id}`, { name, allowedOrigins: origins.split(/[\n,]/).map(s => s.trim()).filter(Boolean) });
      toast('Saved'); reload();
    } catch (e: any) { toast(e.message, 'err'); }
  };

  return (
    <div className="stack">
      <section className="card">
        <h3>How it works</h3>
        <ol className="steps">
          <li>Your <b>server</b> calls our API with your <b>secret license key</b> and gets a short-lived play link.</li>
          <li>Your website or app shows that link inside an iframe / WebView.</li>
          <li>Players pick a username and play. You see everything under <b>Players &amp; Results</b>.</li>
        </ol>
        <p className="muted small">The key never reaches your players: they only ever see a temporary session link that expires after 15 minutes. <a href="/docs/" target="_blank" rel="noreferrer">Read the full integration guide ↗</a></p>
      </section>

      <section className="card">
        <h3>Your license key</h3>
        <div className="row"><div className="secret grow">{license.keyPrefix}••••••••••••••••••••••••••••</div><button className="btn" onClick={rotate}>Rotate key</button></div>
        <p className="muted small">The full key was shown once when you bought this game. If you lost it, rotate it to get a new one.</p>
      </section>

      <section className="card">
        <h3>Settings</h3>
        <div className="field"><label>Name (for you only)</label><input value={name} maxLength={40} onChange={e => setName(e.target.value)} /></div>
        <div className="field wide"><label>Allowed websites (optional)</label>
          <div className="help">One per line, e.g. <span className="mono">https://www.mysite.com</span>. When set, browsers only allow the game to be embedded on these sites. Mobile apps (Flutter WebView) are not affected.</div>
          <textarea rows={3} value={origins} onChange={e => setOrigins(e.target.value)} placeholder="Leave empty to allow any website" />
        </div>
        <button className="btn primary" onClick={saveMeta}>Save settings</button>
      </section>

      <Snippets baseUrl={location.origin} />
      {newKey && (
        <Modal title="🔑 Your new license key" onClose={() => setNewKey('')}>
          <p>Copy it now: <b>it will not be shown again</b>. The old key no longer works.</p>
          <div className="secret">{newKey}</div>
          <div className="row end"><button className="btn primary" onClick={() => setNewKey('')}>Done</button></div>
        </Modal>
      )}
    </div>
  );
}
