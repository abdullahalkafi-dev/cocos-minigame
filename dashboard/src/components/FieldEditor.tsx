import { useRef, useState } from 'react';
import { api } from '../api';
import { useApp } from '../App';

export interface Field {
  key: string; label: string; type: string; help?: string; min?: number; max?: number;
  options?: string[]; itemFields?: Field[]; minItems?: number; maxItems?: number;
}

export function ImageInput({ value, onChange, licenseId, size = 56 }: { value: string; onChange: (v: string) => void; licenseId: string; size?: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useApp();
  const pick = async (f?: File) => {
    if (!f) return; setBusy(true);
    try { onChange(await api.upload(licenseId, f)); } catch (e: any) { toast(e.message, 'err'); }
    setBusy(false); if (ref.current) ref.current.value = '';
  };
  return (
    <div className="img-input">
      <div className="thumb" style={{ width: size, height: size }} onClick={() => ref.current?.click()}>
        {value ? <img src={value} alt="" /> : <span>{busy ? '…' : '+'}</span>}
      </div>
      <div className="col">
        <button type="button" className="btn sm" onClick={() => ref.current?.click()} disabled={busy}>{busy ? 'Uploading…' : value ? 'Replace' : 'Upload'}</button>
        {value && <button type="button" className="btn ghost sm" onClick={() => onChange('')}>Remove</button>}
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => pick(e.target.files?.[0])} />
    </div>
  );
}

function NumberList({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState((value ?? []).join(', '));
  return (
    <input value={text} onChange={e => {
      setText(e.target.value);
      const arr = e.target.value.split(',').map(s => Number(s.trim())).filter(n => s_ok(n));
      if (arr.length) onChange(arr);
    }} />
  );
}
const s_ok = (n: number) => Number.isFinite(n) && n > 0;

export function FieldInput({ f, value, onChange, licenseId, compact }: { f: Field; value: any; onChange: (v: any) => void; licenseId: string; compact?: boolean }) {
  switch (f.type) {
    case 'text': return <input value={value ?? ''} maxLength={60} onChange={e => onChange(e.target.value)} />;
    case 'number': return <input type="number" value={value ?? 0} min={f.min} max={f.max} step="any" onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />;
    case 'color': return (
      <div className="color-input"><input type="color" value={value || '#000000'} onChange={e => onChange(e.target.value)} />
        <input value={value ?? ''} maxLength={7} onChange={e => onChange(e.target.value)} className="mono" /></div>
    );
    case 'image': return <ImageInput value={value ?? ''} onChange={onChange} licenseId={licenseId} size={compact ? 40 : 56} />;
    case 'numberlist': return <NumberList value={value} onChange={onChange} />;
    case 'select': return <select value={value} onChange={e => onChange(e.target.value)}>{f.options!.map(o => <option key={o}>{o}</option>)}</select>;
    case 'list': {
      const items: any[] = value ?? [];
      const blank = () => Object.fromEntries(f.itemFields!.map(sf => [sf.key, sf.type === 'number' ? 1 : sf.type === 'color' ? '#7c3aed' : sf.type === 'image' ? '' : 'New']));
      return (
        <div className="list-editor">
          {items.map((it, i) => (
            <div className="list-item" key={i}>
              <div className="idx">{i + 1}</div>
              <div className="item-fields">
                {f.itemFields!.map(sf => (
                  <label key={sf.key} className={`mini ${sf.type}`}><span>{sf.label}</span>
                    <FieldInput f={sf} compact licenseId={licenseId} value={it[sf.key]} onChange={v => onChange(items.map((x, j) => (j === i ? { ...x, [sf.key]: v } : x)))} />
                  </label>
                ))}
              </div>
              <div className="item-actions">
                <button type="button" className="btn ghost sm" title="Duplicate" disabled={items.length >= (f.maxItems ?? 99)} onClick={() => onChange([...items.slice(0, i + 1), { ...it }, ...items.slice(i + 1)])}>⧉</button>
                <button type="button" className="btn ghost sm" title="Remove" disabled={items.length <= (f.minItems ?? 1)} onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
              </div>
            </div>
          ))}
          <button type="button" className="btn sm" disabled={items.length >= (f.maxItems ?? 99)} onClick={() => onChange([...items, blank()])}>+ Add item</button>
        </div>
      );
    }
    default: return null;
  }
}
