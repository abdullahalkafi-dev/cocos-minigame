import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, getPath, setPath } from '../api';
import { useApp } from '../App';
import { Badge, Button, Icon, MediaPreview, Switch, fmtBytes, typeOf, useDrop } from '../ui';

const ACCEPT: Record<string, string> = {
  image: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml',
  video: 'video/mp4,video/webm',
  audio: 'audio/mpeg,audio/ogg,audio/wav,audio/mp4,.mp3,.ogg,.wav,.m4a',
  media: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,video/mp4,video/webm',
};
const KIND_LABEL: Record<string, string> = { image: 'Image / SVG', video: 'Video', audio: 'Audio', media: 'Image, SVG, sprite sheet or video' };

type AssetVal = { url: string; cols?: number; rows?: number; fps?: number; loop?: boolean };
const asVal = (v: any): AssetVal => (typeof v === 'string' ? { url: v } : v && typeof v === 'object' ? v : { url: '' });

/** the default list item that corresponds to a customised one (by id, or by value for chips; chips fall back to position) */
function matchDef(defList: any[], it: any, i: number) {
  const hit = defList.find(d => (it.id !== undefined ? d.id === it.id : it.value !== undefined && d.value === it.value));
  return hit ?? (it.id === undefined ? defList[i] : undefined);
}

// ------------------------------------------------------------------ one asset slot
function AssetCard({ f, value, def, licenseId, onChange, compact }: { f: any; value: any; def?: any; licenseId: string; onChange: (v: AssetVal) => void; compact?: boolean }) {
  const { toast } = useApp();
  const v = asVal(value), d = asVal(def);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const kind = f.kind || 'image';
  const shown = v.url || d.url;
  const isDefault = !v.url || v.url === d.url;
  const ty = typeOf(shown);
  const [adv, setAdv] = useState(!!(v.cols && v.cols > 1) || !!(v.rows && v.rows > 1));
  const [size, setSize] = useState<string>('');

  const upload = async (file: File) => {
    setBusy(true);
    try { const r = await api.upload(licenseId, file, kind); onChange({ ...v, url: r.url }); setSize(`${file.name} (${fmtBytes(r.size)})`); toast(`${r.type.toUpperCase()} uploaded`); }
    catch (e: any) { toast(e.message, 'err'); }
    setBusy(false); if (input.current) input.current.value = '';
  };
  const drop = useDrop(upload);

  return (
    <div className={`asset ${drop.over ? 'over' : ''} ${!isDefault ? 'changed' : ''}`} {...drop.props}>
      <div className="top">
        <MediaPreview url={shown} size={compact ? 'sm' : 'md'} />
        <div className="meta">
          {!compact && <div className="name">{f.label}</div>}
          <div className="row wrap" style={{ gap: 6 }}>
            {!isDefault ? <Badge tone="brand">Custom</Badge> : <Badge>Default</Badge>}
            {ty !== 'none' && <Badge>{ty === 'image' && /\.svg$/i.test(shown) ? 'SVG' : ty}</Badge>}
          </div>
          {!compact && f.hint && <div className="hint">{f.hint}</div>}
          {size && <div className="hint">{size}</div>}
        </div>
      </div>
      <div className="acts">
        <Button size="sm" icon="upload" loading={busy} onClick={() => input.current?.click()}>{isDefault ? 'Upload' : 'Replace'}</Button>
        {!isDefault && <Button size="sm" variant="ghost" icon="refresh" onClick={() => onChange({ ...v, url: '' })}>Reset</Button>}
        {(kind === 'media' || kind === 'image') && !compact && ty === 'image' && <Button size="sm" variant="ghost" icon="film" onClick={() => setAdv(!adv)}>Animation</Button>}
        <input ref={input} type="file" hidden accept={ACCEPT[kind]} onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
      {!compact && <div className="hint">Drop a file here · {KIND_LABEL[kind]}</div>}
      {adv && ty === 'image' && !compact && (
        <div className="adv">
          <div className="small muted">Treat this image as a <b>sprite sheet</b>: frames are read left-to-right, top-to-bottom.</div>
          <div className="g3">
            <div><label className="lbl">Columns</label><input type="number" min={1} max={64} value={v.cols ?? 1} onChange={e => onChange({ ...v, cols: +e.target.value || 1 })} /></div>
            <div><label className="lbl">Rows</label><input type="number" min={1} max={64} value={v.rows ?? 1} onChange={e => onChange({ ...v, rows: +e.target.value || 1 })} /></div>
            <div><label className="lbl">FPS</label><input type="number" min={1} max={60} value={v.fps ?? 12} onChange={e => onChange({ ...v, fps: +e.target.value || 12 })} /></div>
          </div>
        </div>
      )}
      {ty === 'video' && !compact && <Switch checked={v.loop !== false} onChange={x => onChange({ ...v, loop: x })} label="Loop the video" />}
    </div>
  );
}

// ------------------------------------------------------------------ generic field
function Field({ f, value, onChange, ctx }: { f: any; value: any; onChange: (v: any) => void; ctx: Ctx }) {
  switch (f.type) {
    case 'text': return <input value={value ?? ''} maxLength={80} onChange={e => onChange(e.target.value)} />;
    case 'longtext': return <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} />;
    case 'textlist': return <textarea rows={7} value={Array.isArray(value) ? value.join('\n') : ''} onChange={e => onChange(e.target.value.split('\n'))} placeholder="One per line" />;
    case 'toggle': return <Switch checked={!!value} onChange={onChange} />;
    case 'number': return (
      <div className="unit-in"><input type="number" value={value ?? 0} min={f.min} max={f.max} step={f.step ?? 'any'} onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />{f.unit && <span className="unit">{f.unit}</span>}</div>
    );
    case 'color': return (
      <div className="color-in"><input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)} /><input className="mono" value={value ?? ''} maxLength={7} onChange={e => onChange(e.target.value)} /></div>
    );
    case 'select': return <select value={value} onChange={e => onChange(e.target.value)}>{f.options.map((o: string) => <option key={o}>{o}</option>)}</select>;
    case 'numberlist': return <input value={Array.isArray(value) ? value.join(', ') : ''} onChange={e => onChange(e.target.value.split(',').map(s => Number(s.trim())).filter(n => n > 0))} />;
    case 'asset': return <AssetCard f={f} value={value} def={getPath(ctx.defaults, f.key)} licenseId={ctx.licenseId} onChange={onChange} />;
    case 'list': return <ListField f={f} value={value} onChange={onChange} ctx={ctx} />;
    default: return null;
  }
}

interface Ctx { licenseId: string; defaults: any; config: any }

function blankItem(f: any, ctx: Ctx) {
  const o: any = {};
  f.itemFields.forEach((sf: any) => {
    o[sf.key] = sf.type === 'number' ? (sf.min && sf.min > 1 ? sf.min : 1) : sf.type === 'toggle' ? false : sf.type === 'asset' ? { url: '' }
      : sf.key === 'id' ? 'opt' + Math.random().toString(36).slice(2, 6)
      : sf.key === 'target' ? (ctx.config.targets?.[0]?.id ?? '') : 'New';
  });
  return o;
}

function ListField({ f, value, onChange, ctx }: { f: any; value: any[]; onChange: (v: any[]) => void; ctx: Ctx }) {
  const items: any[] = value ?? [];
  const set = (i: number, k: string, v: any) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= items.length) return; const a = items.slice(); [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  const defList: any[] = getPath(ctx.defaults, f.key) ?? [];
  return (
    <div className="stack-sm" style={{ gridColumn: '1 / -1' }}>
      {items.map((it, i) => (
        <div className={`li ${items.length && !f.itemFields.some((x: any) => x.type === 'asset') ? 'simple' : ''}`} key={i}>
          <div className="idx">{i + 1}</div>
          <div className="lf">
            {f.itemFields.map((sf: any) => {
              const val = it[sf.key];
              return (
                <div key={sf.key} style={sf.type === 'asset' ? { gridColumn: 'span 2' } : undefined}>
                  <div className="lbl">{sf.label}</div>
                  {sf.readonlyInList ? <span className="code">{val}</span>
                    : sf.type === 'asset' ? <AssetCard f={sf} compact value={val} def={(matchDef(defList, it, i) ?? defList[i])?.[sf.key]} licenseId={ctx.licenseId} onChange={v => set(i, sf.key, v)} />
                    : sf.key === 'target' && f.key === 'segments' ? (
                      <select value={val} onChange={e => set(i, sf.key, e.target.value)}>{(ctx.config.targets ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.label} ({t.id})</option>)}</select>
                    ) : <Field f={sf} value={val} onChange={v => set(i, sf.key, v)} ctx={ctx} />}
                </div>
              );
            })}
          </div>
          <div className="la">
            <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} title="Move up"><Icon name="up" size={15} /></Button>
            <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Move down"><Icon name="down" size={15} /></Button>
            <Button size="sm" variant="ghost" onClick={() => onChange([...items.slice(0, i + 1), { ...it, ...(it.id ? { id: 'opt' + Math.random().toString(36).slice(2, 6) } : {}) }, ...items.slice(i + 1)])} disabled={items.length >= (f.maxItems ?? 99)} title="Duplicate"><Icon name="copy" size={15} /></Button>
            <Button size="sm" variant="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))} disabled={items.length <= (f.minItems ?? 1)} title="Remove"><Icon name="trash" size={15} /></Button>
          </div>
        </div>
      ))}
      <div><Button size="sm" icon="plus" disabled={items.length >= (f.maxItems ?? 99)} onClick={() => onChange([...items, blankItem(f, ctx)])}>Add {f.itemLabel || 'item'}</Button></div>
    </div>
  );
}

// ------------------------------------------------------------------ save normalisation: default assets are stored as "use default"
function normalize(f: any, v: any, defaults: any): any {
  if (f.type === 'asset') {
    const o = asVal(v), d = asVal(getPath(defaults, f.key));
    return { ...o, url: o.url === d.url ? '' : o.url };
  }
  if (f.type === 'list') {
    const defList: any[] = getPath(defaults, f.key) ?? [];
    return (v ?? []).map((it: any, i: number) => {
      const out = { ...it };
      f.itemFields.filter((x: any) => x.type === 'asset').forEach((sf: any) => {
        const d = asVal((matchDef(defList, it, i) ?? defList[i])?.[sf.key]);
        const o = asVal(it[sf.key]); out[sf.key] = { ...o, url: o.url === d.url ? '' : o.url };
      });
      return out;
    });
  }
  return v;
}

// ------------------------------------------------------------------ the studio
export default function Studio({ data }: { data: any }) {
  const { license, game } = data;
  const { toast } = useApp();
  const [config, setConfig] = useState<any>(data.config);
  const [saved, setSaved] = useState<string>(JSON.stringify(data.config));
  const [busy, setBusy] = useState(false);
  const [sec, setSec] = useState<string>(game.manifest[0].id);
  const [q, setQ] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const dirty = JSON.stringify(config) !== saved;
  const ctx: Ctx = { licenseId: license.id, defaults: data.defaults, config };

  const loadPreview = useCallback(async () => { setPreviewUrl((await api.post(`/api/licenses/${license.id}/preview-session`)).playUrl); }, [license.id]);
  useEffect(() => { loadPreview(); }, [loadPreview]);
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [dirty]);

  const savedCfg = useMemo(() => JSON.parse(saved), [saved]);
  const changedIn = (g: any) => g.fields.some((f: any) => JSON.stringify(getPath(config, f.key)) !== JSON.stringify(getPath(savedCfg, f.key)));
  const group = game.manifest.find((g: any) => g.id === sec) ?? game.manifest[0];
  const visibleNav = game.manifest.filter((g: any) => !q || g.title.toLowerCase().includes(q.toLowerCase()) || g.fields.some((f: any) => f.label.toLowerCase().includes(q.toLowerCase())));
  const fields = group.fields.filter((f: any) => !q || group.title.toLowerCase().includes(q.toLowerCase()) || f.label.toLowerCase().includes(q.toLowerCase()));
  const assetFields = fields.filter((f: any) => f.type === 'asset'), otherFields = fields.filter((f: any) => f.type !== 'asset');

  const save = async () => {
    setBusy(true);
    try {
      const all = game.manifest.flatMap((g: any) => g.fields);
      const flat = Object.fromEntries(all.map((f: any) => [f.key, normalize(f, getPath(config, f.key), data.defaults)]));
      const r = await api.put(`/api/licenses/${license.id}/config`, { config: flat });
      setConfig(r.config); setSaved(JSON.stringify(r.config));
      toast('Saved. Refreshing preview…'); await loadPreview();
    } catch (e: any) { toast(e.message, 'err'); }
    setBusy(false);
  };
  const discard = () => setConfig(JSON.parse(saved));
  const upd = (f: any) => (v: any) => setConfig((c: any) => setPath(c, f.key, v));

  return (
    <>
      <div className="studio">
        <nav className="snav">
          <input placeholder="Search settings…" value={q} onChange={e => setQ(e.target.value)} />
          {visibleNav.map((g: any) => (
            <button key={g.id} className={sec === g.id ? 'on' : ''} onClick={() => setSec(g.id)}>
              <span>{g.title}</span>{changedIn(g) && <span className="dot" title="Unsaved changes" />}
            </button>
          ))}
        </nav>

        <div className="stack">
          <div className="card">
            <div className="sect-head"><h2>{group.title}</h2>{group.description && <p>{group.description}</p>}</div>
            <div className="fields">
              {otherFields.map((f: any) => (
                <div key={f.key} className={f.type === 'list' || f.type === 'textlist' || f.type === 'longtext' ? 'wide' : ''}>
                  <label className="lbl">{f.label}</label>
                  <Field f={f} value={getPath(config, f.key)} onChange={upd(f)} ctx={ctx} />
                  {f.help && <div className="help">{f.help}</div>}
                </div>
              ))}
              {assetFields.length > 0 && (
                <div className="asset-grid">
                  {assetFields.map((f: any) => <AssetCard key={f.key} f={f} value={getPath(config, f.key)} def={getPath(data.defaults, f.key)} licenseId={license.id} onChange={upd(f)} />)}
                </div>
              )}
              {!fields.length && <div className="muted wide">No settings match “{q}”.</div>}
            </div>
          </div>
        </div>

        <aside className="preview-col">
          <div className="phone">{previewUrl ? <iframe src={previewUrl} title="Live preview" allow="autoplay; fullscreen" /> : null}</div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Button size="sm" icon="refresh" onClick={loadPreview}>Reload</Button>
            <a href={previewUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost" icon="external">Open full size</Button></a>
          </div>
          <p className="muted small" style={{ textAlign: 'center' }}>Live preview of your <b>saved</b> settings. Players you test with here are not counted.</p>
        </aside>
      </div>

      {dirty && (
        <div className="savebar">
          <span className="dirty">Unsaved changes</span>
          <div className="row"><Button variant="ghost" onClick={discard}>Discard</Button><Button variant="primary" icon="check" loading={busy} onClick={save}>Save changes</Button></div>
        </div>
      )}
    </>
  );
}
