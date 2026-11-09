// Game catalog: each game declares a manifest. The buyer dashboard renders the customization
// form straight from this manifest, and the Cocos game reads the merged config at runtime.

export type FieldType = 'text' | 'number' | 'color' | 'image' | 'numberlist' | 'select' | 'list';
export interface Field {
  key: string; label: string; type: FieldType; help?: string;
  min?: number; max?: number; options?: string[];
  itemFields?: Field[]; // for type: list
  minItems?: number; maxItems?: number;
}
export interface Group { title: string; fields: Field[] }
export interface GameDef {
  slug: string; name: string; tagline: string; price: number; tech: string[];
  defaults: Record<string, any>; manifest: Group[];
}

const themeGroup: Group = {
  title: 'Theme', fields: [
    { key: 'theme.primary', label: 'Primary color', type: 'color' },
    { key: 'theme.secondary', label: 'Accent color', type: 'color' },
    { key: 'theme.background', label: 'Background color', type: 'color' },
    { key: 'theme.text', label: 'Text color', type: 'color' },
  ],
};
const general = (extra: Field[] = []): Group => ({
  title: 'General', fields: [
    { key: 'title', label: 'Game title', type: 'text' },
    { key: 'currencyName', label: 'Currency name', type: 'text', help: 'Shown in the UI, e.g. Coins, Gems, Points' },
    { key: 'startingBalance', label: 'Starting balance for new players', type: 'number', min: 0, max: 10_000_000 },
    ...extra,
  ],
});
const imagesGroup: Group = {
  title: 'Images', fields: [
    { key: 'images.logo', label: 'Logo', type: 'image', help: 'PNG/JPG/WebP, max 2 MB. Leave empty to use the default.' },
    { key: 'images.background', label: 'Background', type: 'image' },
  ],
};

export const GAMES: GameDef[] = [
  {
    slug: 'lucky-spin', name: 'Lucky Spin', price: 1500,
    tagline: 'Fortune wheel with weighted prizes, confetti and a server-decided result.',
    tech: ['Cocos Creator 3.8 (2D, TypeScript)', 'Tween easing for the wheel spin', 'Procedural confetti particles', 'Server-authoritative RNG (crypto)', 'Runtime config + remote images'],
    defaults: {
      title: 'Lucky Spin', currencyName: 'Coins', startingBalance: 1000, betOptions: [10, 50, 100],
      theme: { primary: '#7c3aed', secondary: '#fbbf24', background: '#1e1b4b', text: '#ffffff' },
      images: { logo: '', background: '' },
      prizes: [
        { label: 'Try again', multiplier: 0, weight: 22, color: '#475569', image: '' },
        { label: 'x0.5', multiplier: 0.5, weight: 22, color: '#0ea5e9', image: '' },
        { label: 'x1', multiplier: 1, weight: 16, color: '#22c55e', image: '' },
        { label: 'x2', multiplier: 2, weight: 12, color: '#f59e0b', image: '' },
        { label: 'Try again', multiplier: 0, weight: 18, color: '#334155', image: '' },
        { label: 'x3', multiplier: 3, weight: 6, color: '#ec4899', image: '' },
        { label: 'x5', multiplier: 5, weight: 3, color: '#a855f7', image: '' },
        { label: 'JACKPOT x10', multiplier: 10, weight: 1, color: '#ef4444', image: '' },
      ],
    },
    manifest: [
      general([{ key: 'betOptions', label: 'Bet sizes', type: 'numberlist', help: 'Comma separated, e.g. 10, 50, 100' }]),
      themeGroup,
      imagesGroup,
      { title: 'Wheel prizes', fields: [{
        key: 'prizes', label: 'Segments (8 recommended)', type: 'list', minItems: 2, maxItems: 12,
        help: 'Multiplier is applied to the bet. Weight = how often it lands (higher = more often).',
        itemFields: [
          { key: 'label', label: 'Label', type: 'text' },
          { key: 'multiplier', label: 'Multiplier', type: 'number', min: 0, max: 1000 },
          { key: 'weight', label: 'Weight', type: 'number', min: 0, max: 1000 },
          { key: 'color', label: 'Color', type: 'color' },
          { key: 'image', label: 'Icon', type: 'image' },
        ],
      }] },
    ],
  },
  {
    slug: 'lucky-77', name: 'Lucky 77', price: 2500,
    tagline: '3x3 slot machine with 5 paylines, win highlights and a jackpot celebration.',
    tech: ['Cocos Creator 3.8 (2D, TypeScript)', 'Masked reels with eased tween stops', '5 paylines + animated win lines', 'Procedural particles & screen shake', 'Server-authoritative RNG (crypto)'],
    defaults: {
      title: 'Lucky 77', currencyName: 'Coins', startingBalance: 1000, betOptions: [10, 50, 100],
      theme: { primary: '#dc2626', secondary: '#fbbf24', background: '#2a0a0a', text: '#ffffff' },
      images: { logo: '', background: '' },
      symbols: [
        { label: '7', multiplier: 77, weight: 3, color: '#ef4444', image: '' },
        { label: 'Diamond', multiplier: 60, weight: 5, color: '#38bdf8', image: '' },
        { label: 'BAR', multiplier: 40, weight: 8, color: '#a3a3a3', image: '' },
        { label: 'Bell', multiplier: 30, weight: 11, color: '#fbbf24', image: '' },
        { label: 'Cherry', multiplier: 20, weight: 15, color: '#f43f5e', image: '' },
        { label: 'Lemon', multiplier: 11, weight: 18, color: '#facc15', image: '' },
      ],
    },
    manifest: [
      general([{ key: 'betOptions', label: 'Bet sizes', type: 'numberlist', help: 'Total bet per spin, split across 5 paylines' }]),
      themeGroup,
      imagesGroup,
      { title: 'Symbols', fields: [{
        key: 'symbols', label: 'Reel symbols', type: 'list', minItems: 3, maxItems: 8,
        help: 'Multiplier is paid on the line stake (bet / 5) when 3 match on a payline. Highest multiplier = jackpot symbol.',
        itemFields: [
          { key: 'label', label: 'Label', type: 'text' },
          { key: 'multiplier', label: '3-in-a-row multiplier', type: 'number', min: 0, max: 10000 },
          { key: 'weight', label: 'Weight', type: 'number', min: 0, max: 1000 },
          { key: 'color', label: 'Color', type: 'color' },
          { key: 'image', label: 'Symbol image', type: 'image' },
        ],
      }] },
    ],
  },
  {
    slug: 'ludo', name: 'Ludo Royale', price: 2000,
    tagline: 'Classic 4-player Ludo against smart bots with animated dice and token moves.',
    tech: ['Cocos Creator 3.8 (2D, TypeScript)', 'Game-state machine + rule engine (capture, safe cells, extra turn on 6)', 'Bot AI with difficulty levels', 'Tween-animated dice and token paths', 'Match results saved to the dashboard'],
    defaults: {
      title: 'Ludo Royale', currencyName: 'Coins', startingBalance: 1000,
      entryFee: 100, firstMultiplier: 3.5, secondMultiplier: 0, botLevel: 'normal',
      theme: { primary: '#2563eb', secondary: '#f59e0b', background: '#0f172a', text: '#ffffff' },
      colors: { red: '#ef4444', green: '#22c55e', yellow: '#eab308', blue: '#3b82f6' },
      images: { logo: '', background: '' },
    },
    manifest: [
      general([
        { key: 'entryFee', label: 'Match entry fee', type: 'number', min: 0, max: 1_000_000 },
        { key: 'firstMultiplier', label: '1st place payout (x entry fee)', type: 'number', min: 0, max: 100 },
        { key: 'secondMultiplier', label: '2nd place payout (x entry fee)', type: 'number', min: 0, max: 100 },
        { key: 'botLevel', label: 'Bot difficulty', type: 'select', options: ['easy', 'normal', 'hard'] },
      ]),
      themeGroup,
      { title: 'Player colors', fields: [
        { key: 'colors.red', label: 'Red player', type: 'color' },
        { key: 'colors.green', label: 'Green player', type: 'color' },
        { key: 'colors.yellow', label: 'Yellow player', type: 'color' },
        { key: 'colors.blue', label: 'Blue player', type: 'color' },
      ] },
      imagesGroup,
    ],
  },
];
export const gameBySlug = (slug: string) => GAMES.find(g => g.slug === slug);

// ---- config helpers (dotted keys) ----
export function setPath(obj: any, path: string, value: any) {
  const parts = path.split('.'); let o = obj;
  parts.slice(0, -1).forEach(p => { o[p] = o[p] && typeof o[p] === 'object' ? o[p] : {}; o = o[p]; });
  o[parts[parts.length - 1]] = value;
}
export function getPath(obj: any, path: string) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }

const HEX = /^#[0-9a-fA-F]{6}$/;
type Checked = { v?: any; err?: string };

function checkField(f: Field, v: any, where: string): Checked {
  switch (f.type) {
    case 'text': return typeof v === 'string' ? { v: v.slice(0, 60) } : { err: `${where}: text expected` };
    case 'color': return typeof v === 'string' && HEX.test(v) ? { v } : { err: `${where}: color must be #rrggbb` };
    case 'image':
      if (typeof v !== 'string') return { err: `${where}: image url expected` };
      if (v && !/^\/uploads\/[\w-]+\/[\w.-]+$/.test(v)) return { err: `${where}: image must be an uploaded file` };
      return { v };
    case 'number': {
      const n = Number(v);
      if (!Number.isFinite(n)) return { err: `${where}: number expected` };
      if (f.min !== undefined && n < f.min) return { err: `${where}: minimum is ${f.min}` };
      if (f.max !== undefined && n > f.max) return { err: `${where}: maximum is ${f.max}` };
      return { v: n };
    }
    case 'numberlist': {
      const arr = (Array.isArray(v) ? v : String(v).split(',')).map(Number);
      if (!arr.length || arr.length > 8 || arr.some(n => !Number.isFinite(n) || n <= 0 || n > 1e7)) return { err: `${where}: enter 1-8 positive numbers` };
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
          const r = checkField(sf, v[i]?.[sf.key] ?? (sf.type === 'image' ? '' : undefined), `${where} #${i + 1} ${sf.label}`);
          if (r.err) return { err: r.err };
          item[sf.key] = r.v;
        }
        items.push(item);
      }
      if (items.every(i => (i.weight ?? 1) <= 0)) return { err: `${where}: at least one item needs weight above 0` };
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
