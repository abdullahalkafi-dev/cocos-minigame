import type { Field, GameDef } from './catalog.types.js';

// Validation of buyer-supplied config against a game manifest, and default filling.
// ------------------------------------------------------------------ config helpers
export function setPath(obj: any, path: string, value: any) {
  const parts = path.split('.'); let o = obj;
  parts.slice(0, -1).forEach(p => { o[p] = o[p] && typeof o[p] === 'object' ? o[p] : {}; o = o[p]; });
  o[parts[parts.length - 1]] = value;
}
export function getPath(obj: any, path: string) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }

const HEX = /^#[0-9a-fA-F]{6}$/;
export const ASSET_URL = /^\/(uploads\/lic_[\w-]+|defaults\/[\w-]+)\/[\w.-]+$/;
type Checked = { v?: any; err?: string };

function checkAsset(f: Field, v: any, where: string): Checked {
  const o = typeof v === 'string' ? { url: v } : v;
  if (!o || typeof o !== 'object') return { err: `${where}: asset expected` };
  const url = typeof o.url === 'string' ? o.url : '';
  if (url && !ASSET_URL.test(url)) return { err: `${where}: file must be uploaded through the dashboard` };
  const out: any = { url };
  const int = (n: any, lo: number, hi: number) => (Number.isInteger(Number(n)) && Number(n) >= lo && Number(n) <= hi ? Number(n) : null);
  if (o.cols !== undefined) { const n = int(o.cols, 1, 64); if (n === null) return { err: `${where}: columns 1-64` }; out.cols = n; }
  if (o.rows !== undefined) { const n = int(o.rows, 1, 64); if (n === null) return { err: `${where}: rows 1-64` }; out.rows = n; }
  if (o.fps !== undefined) { const n = int(o.fps, 1, 60); if (n === null) return { err: `${where}: fps 1-60` }; out.fps = n; }
  if (o.loop !== undefined) out.loop = !!o.loop;
  if (o.blend !== undefined) { if (!['normal', 'add'].includes(o.blend)) return { err: `${where}: blend` }; out.blend = o.blend; }
  return { v: out };
}

function checkField(f: Field, v: any, where: string): Checked {
  switch (f.type) {
    case 'text': return typeof v === 'string' ? { v: v.slice(0, 80) } : { err: `${where}: text expected` };
    case 'longtext': return typeof v === 'string' ? { v: v.slice(0, 600) } : { err: `${where}: text expected` };
    case 'textlist': {
      const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : null;
      if (!arr) return { err: `${where}: list of lines expected` };
      const lines = arr.map(s => String(s).trim()).filter(Boolean).slice(0, 12).map(s => s.slice(0, 240));
      return { v: lines };
    }
    case 'toggle': return { v: !!v };
    case 'color': return typeof v === 'string' && HEX.test(v) ? { v } : { err: `${where}: color must be #rrggbb` };
    case 'asset': return checkAsset(f, v, where);
    case 'number': {
      const n = Number(v);
      if (!Number.isFinite(n)) return { err: `${where}: number expected` };
      if (f.min !== undefined && n < f.min) return { err: `${where}: minimum is ${f.min}` };
      if (f.max !== undefined && n > f.max) return { err: `${where}: maximum is ${f.max}` };
      return { v: n };
    }
    case 'numberlist': {
      const arr = (Array.isArray(v) ? v : String(v).split(',')).map(Number);
      if (!arr.length || arr.length > 8 || arr.some(n => !Number.isFinite(n) || n <= 0 || n > 1e9)) return { err: `${where}: enter 1-8 positive numbers` };
      return { v: arr };
    }
    case 'select': return f.options?.includes(v) ? { v } : { err: `${where}: invalid option` };
    case 'list': {
      if (!Array.isArray(v)) return { err: `${where}: list expected` };
      if (f.minItems && v.length < f.minItems) return { err: `${where}: needs at least ${f.minItems} items` };
      if (f.maxItems && v.length > f.maxItems) return { err: `${where}: allows at most ${f.maxItems} items` };
      const items: any[] = [];
      for (let i = 0; i < v.length; i++) {
        const item: any = {};
        for (const sf of f.itemFields!) {
          const raw = v[i]?.[sf.key];
          if (raw === undefined && sf.type === 'asset') { item[sf.key] = { url: '' }; continue; }
          if (raw === undefined && sf.type === 'toggle') { item[sf.key] = false; continue; }
          const r = checkField(sf, raw, `${where} #${i + 1} ${sf.label}`);
          if (r.err) return { err: r.err };
          item[sf.key] = r.v;
        }
        items.push(item);
      }
      return { v: items };
    }
  }
}

/** Validates and sanitises an incoming config (flat dotted keys or nested) against the manifest. */
export function sanitizeConfig(def: GameDef, input: any): { ok: true; config: any } | { ok: false; error: string } {
  const out: any = {};
  for (const g of def.manifest) for (const f of g.fields) {
    const raw = input && typeof input === 'object' ? (f.key in input ? input[f.key] : getPath(input, f.key)) : undefined;
    if (raw === undefined) continue;
    const r = checkField(f, raw, f.label);
    if (r.err) return { ok: false, error: r.err };
    setPath(out, f.key, r.v);
  }
  return { ok: true, config: out };
}

/** Fill empty asset slots with the game's built-in default (so "no upload" always means "default"). */
export function fillAssetDefaults(def: GameDef, cfg: any): any {
  const d = def.defaults;
  if (cfg.assets && d.assets) for (const k of Object.keys(d.assets)) {
    if (!cfg.assets[k]?.url && d.assets[k]?.url) cfg.assets[k] = { ...(cfg.assets[k] || {}), ...d.assets[k] };
  }
  const fillList = (name: string, key: string, assetFields: string[], byIndex = false) => {
    (cfg[name] || []).forEach((it: any, idx: number) => {
      const base = (d[name] || []).find((x: any) => x[key] === it[key]) ?? (byIndex ? (d[name] || [])[idx] : undefined);
      assetFields.forEach(af => { if (!it[af]?.url && base?.[af]?.url) it[af] = { ...base[af] }; });
    });
  };
  fillList('targets', 'id', ['icon', 'badge']);
  fillList('chips', 'value', ['image'], true);
  return cfg;
}
