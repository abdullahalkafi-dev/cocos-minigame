// Game catalog. Each game declares a MANIFEST: the list of everything a buyer may customise.
//  - the dashboard renders its forms straight from the manifest (no per-game dashboard code)
//  - the server validates incoming config against it
//  - the Cocos game reads the merged result at runtime
//
// Asset slots ("asset" fields) are typed: image (png/jpg/webp/gif/svg), video (mp4/webm), audio (mp3/ogg/wav/m4a),
// or "media" (image, SVG, sprite-sheet animation or video). A slot always has a built-in default, so a buyer
// only uploads what they want to change.

export type FieldType = 'text' | 'longtext' | 'textlist' | 'number' | 'color' | 'asset' | 'numberlist' | 'select' | 'toggle' | 'list';
export type AssetKind = 'image' | 'video' | 'audio' | 'media';
export interface Field {
  key: string; label: string; type: FieldType; help?: string;
  min?: number; max?: number; step?: number; unit?: string; options?: string[];
  itemFields?: Field[]; minItems?: number; maxItems?: number; itemLabel?: string;
  kind?: AssetKind; hint?: string;            // asset fields: what is accepted, recommended size
  readonlyInList?: boolean;                    // list item field that is an identifier
}
export interface Group { id: string; title: string; description?: string; fields: Field[] }
export interface GameDef {
  slug: string; name: string; tagline: string; price: number; tech: string[];
  defaults: Record<string, any>; manifest: Group[];
  validate?: (cfg: any) => string | null;
}

const D = '/defaults/lucky-wheel/';
const img = (file: string) => ({ url: D + file });
const asset = (key: string, label: string, kind: AssetKind, hint: string): Field => ({ key: `assets.${key}`, label, type: 'asset', kind, hint });

// ------------------------------------------------------------------ Lucky Wheel 77
const lucky: GameDef = {
  slug: 'lucky-wheel',
  name: 'Lucky Wheel 77',
  price: 3000,
  tagline: 'Live betting wheel: players bet on fruits or 77, a shared round clock spins the wheel, and winners are paid instantly.',
  tech: [
    'Cocos Creator 3.8 (2D, TypeScript), WebGL2',
    'Shared server round clock, results decided by the server (crypto RNG)',
    'Every visual is a swappable slot: PNG / WebP / SVG / sprite-sheet / video / audio',
    'Rules, odds, wheel layout, chips and texts come from the database',
    'Round history, my bets, ranking and winners popups',
  ],
  defaults: {
    title: 'Lucky Wheel 77',
    currencyName: 'Coins',
    startingBalance: 5_000_000,
    theme: { primary: '#7c3aed', secondary: '#fbbf24', background: '#14052e', text: '#ffffff', popup: '#2b0f73', accent: '#facc15' },
    timing: { betSeconds: 20, spinSeconds: 6, resultSeconds: 6 },
    limits: { maxPerTarget: 50_000_000 },
    bonus: { chance: 0.25 },
    // where the round hole of the wheel frame is, as fractions of the frame image (only change with different frame art)
    wheelGeom: { cx: 0.4997, cy: 0.481, r: 0.2672 },
    chips: [
      { value: 30_000, image: img('chip-1.webp') },
      { value: 300_000, image: img('chip-2.webp') },
      { value: 1_000_000, image: img('chip-3.webp') },
      { value: 3_000_000, image: img('chip-4.webp') },
    ],
    targets: [
      { id: 'watermelon', label: 'Watermelon', multiplier: 2, lucky: false, icon: img('icon-watermelon.webp'), badge: img('mult-x2.webp') },
      { id: 'seven', label: 'Lucky 77', multiplier: 8, lucky: true, icon: img('icon-seven.webp'), badge: img('mult-x8.webp') },
      { id: 'plum', label: 'Prune', multiplier: 2, lucky: false, icon: img('icon-plum.webp'), badge: img('mult-x2.webp') },
    ],
    // clockwise from the top; the default disc art has 9 wedges (pink wedge on top)
    segments: [
      { target: 'seven', weight: 1 }, { target: 'watermelon', weight: 1 }, { target: 'plum', weight: 1 },
      { target: 'watermelon', weight: 1 }, { target: 'plum', weight: 1 }, { target: 'watermelon', weight: 1 },
      { target: 'plum', weight: 1 }, { target: 'watermelon', weight: 1 }, { target: 'plum', weight: 1 },
    ],
    texts: {
      roundLabel: 'Round',
      placeBets: 'Place your bets',
      noMoreBets: 'No more bets',
      repeatBet: 'Repeat Bet',
      howToPlayTitle: 'HOW TO PLAY',
      howToPlay: [
        'Players can place bets on the fruit or 77 they predict the wheel will stop on, in order to earn rewards.',
        'Players need to select the betting amount before starting the game.',
        'Players can choose either watermelon or prune on the wheel.',
        'If the result matches the player\'s bet, they will receive rewards based on the odds.',
        'Different options have different odds, players can analyze the probability of options by observing the game history.',
        'When lucky 77 occurs, there is a chance to hit multiple awards at the same time.',
      ],
      goodLuckTitle: 'GOOD LUCK',
      goodLuckBody: 'Congratulations to the following winner (s)',
      historyTitle: 'GAME HISTORY',
      myBetsTitle: 'MY BETS',
      rankingTitle: 'RANKING',
    },
    assets: {
      background: img('background.webp'),
      wheelFrame: img('wheel-frame.webp'),
      wheelDisc: img('wheel-disc.webp'),
      wheelHub: img('wheel-hub.webp'),
      ribbon: img('ribbon.webp'),
      badgeNew: img('badge-new.webp'),
      boxFrame: img('box-frame.webp'),
      btnBack: img('btn-back.webp'),
      btnHelp: img('btn-help.webp'),
      btnSound: img('btn-sound.webp'),
      btnHistory: img('btn-history.webp'),
      btnMyBets: img('btn-mybets.webp'),
      btnRanking: img('btn-ranking.webp'),
      btnRepeat: img('btn-repeat.webp'),
      logo: { url: '' },
      avatar: { url: '' },
      fxIdle: { url: '' },
      fxWin: { url: '' },
      fxJackpot: { url: '' },
      sfxSpin: { url: '' }, sfxTick: { url: '' }, sfxWin: { url: '' }, sfxLose: { url: '' }, sfxChip: { url: '' },
      music: { url: '' },
    },
  },
  manifest: [
    {
      id: 'general', title: 'General', description: 'Names, currency and the economy.',
      fields: [
        { key: 'title', label: 'Game title', type: 'text', help: 'Shown in the browser tab and as the page title.' },
        { key: 'currencyName', label: 'Currency name', type: 'text', help: 'e.g. Coins, Gems, Points.' },
        { key: 'startingBalance', label: 'Starting balance', type: 'number', min: 0, max: 1_000_000_000, help: 'What a brand-new player starts with (and gets back with a free refill).' },
        { key: 'limits.maxPerTarget', label: 'Max bet per option per round', type: 'number', min: 1, max: 1_000_000_000 },
      ],
    },
    {
      id: 'rules', title: 'Rules & odds', description: 'What players can bet on and how often each option comes up.',
      fields: [
        {
          key: 'targets', label: 'Bet options', type: 'list', itemLabel: 'option', minItems: 2, maxItems: 6,
          help: 'Each option gets a box on the screen. The multiplier is paid on the amount bet (stake included).',
          itemFields: [
            { key: 'id', label: 'Code', type: 'text', readonlyInList: true, help: 'a-z, 0-9, _ (max 16). Used by the wheel layout below.' },
            { key: 'label', label: 'Name', type: 'text' },
            { key: 'multiplier', label: 'Payout multiplier', type: 'number', min: 1.1, max: 1000, step: 0.1, unit: 'x' },
            { key: 'lucky', label: 'Lucky option (can trigger a bonus hit)', type: 'toggle' },
            { key: 'icon', label: 'Icon', type: 'asset', kind: 'media', hint: 'Transparent PNG/WebP/SVG, ~250 x 250' },
            { key: 'badge', label: 'Multiplier badge', type: 'asset', kind: 'media', hint: 'Transparent PNG/WebP/SVG, ~160 x 90' },
          ],
        },
        {
          key: 'segments', label: 'Wheel layout', type: 'list', itemLabel: 'segment', minItems: 4, maxItems: 24,
          help: 'Segments clockwise from the top. The wheel artwork must have the same number of wedges. Chance of an option = its share of the weights.',
          itemFields: [
            { key: 'target', label: 'Option code', type: 'text' },
            { key: 'weight', label: 'Weight', type: 'number', min: 0, max: 1000 },
          ],
        },
        { key: 'bonus.chance', label: 'Bonus chance when the lucky option hits', type: 'number', min: 0, max: 1, step: 0.05, help: '0.25 = 25% chance that a second option is also paid in the same round.' },
      ],
    },
    {
      id: 'chips', title: 'Chips', description: 'The chip values players can bet with.',
      fields: [{
        key: 'chips', label: 'Chips', type: 'list', itemLabel: 'chip', minItems: 2, maxItems: 5,
        itemFields: [
          { key: 'value', label: 'Value', type: 'number', min: 1, max: 1_000_000_000 },
          { key: 'image', label: 'Chip image', type: 'asset', kind: 'media', hint: 'Transparent PNG/WebP/SVG, square ~200 x 200' },
        ],
      }],
    },
    {
      id: 'timing', title: 'Round timing', description: 'The shared round clock.',
      fields: [
        { key: 'timing.betSeconds', label: 'Betting time', type: 'number', min: 8, max: 120, unit: 's' },
        { key: 'timing.spinSeconds', label: 'Spin time', type: 'number', min: 3, max: 15, unit: 's' },
        { key: 'timing.resultSeconds', label: 'Result time', type: 'number', min: 3, max: 20, unit: 's' },
      ],
    },
    {
      id: 'look', title: 'Colors', description: 'Accent colors used by popups, buttons and text.',
      fields: [
        { key: 'theme.primary', label: 'Primary', type: 'color' },
        { key: 'theme.secondary', label: 'Gold / highlight', type: 'color' },
        { key: 'theme.accent', label: 'Popup border', type: 'color' },
        { key: 'theme.popup', label: 'Popup background', type: 'color' },
        { key: 'theme.background', label: 'Background (behind image)', type: 'color' },
        { key: 'theme.text', label: 'Text', type: 'color' },
      ],
    },
    {
      id: 'scene', title: 'Scene art', description: 'Background and wheel graphics.',
      fields: [
        asset('background', 'Background', 'media', 'Portrait image/SVG/video, ~1080 x 1920. A video loops silently.'),
        asset('wheelFrame', 'Wheel frame', 'media', 'Transparent PNG/WebP/SVG with a round hole in the middle. Keeps the default proportions (about 1587 x 1345).'),
        asset('wheelDisc', 'Wheel disc (spins)', 'image', 'Square, circular, transparent outside. Same number of wedges as the wheel layout.'),
        asset('wheelHub', 'Wheel hub (shows the countdown)', 'image', 'Square ~230 x 230'),
        asset('ribbon', 'History ribbon', 'image', 'Wide banner ~1680 x 280'),
        asset('badgeNew', '"New" badge', 'image', '~180 x 120'),
        asset('boxFrame', 'Bet box frame', 'image', '~550 x 356'),
        asset('logo', 'Logo (optional)', 'image', 'Transparent PNG/SVG. Shown top-left under the round number.'),
        asset('avatar', 'Default player avatar', 'image', 'Square ~160 x 160'),
      ],
    },
    {
      id: 'advanced', title: 'Advanced', description: 'Only needed when you use a different wheel frame.',
      fields: [
      { key: 'wheelGeom.cx', label: 'Frame hole: centre X', type: 'number', min: 0.2, max: 0.8, step: 0.001, help: 'Advanced. Only for custom frame art: horizontal centre of the round hole as a fraction of the frame width.' },
      { key: 'wheelGeom.cy', label: 'Frame hole: centre Y', type: 'number', min: 0.2, max: 0.8, step: 0.001, help: 'Advanced. Vertical centre as a fraction of the frame height.' },
      { key: 'wheelGeom.r', label: 'Frame hole: radius', type: 'number', min: 0.1, max: 0.5, step: 0.001, help: 'Advanced. Radius as a fraction of the frame width.' },
      ],
    },
    {
      id: 'buttons', title: 'Buttons & icons', description: 'Interface buttons. Square images work best.',
      fields: [
        asset('btnBack', 'Back', 'image', '~160 x 160'),
        asset('btnHelp', 'Help', 'image', '~160 x 160'),
        asset('btnSound', 'Sound', 'image', '~160 x 160'),
        asset('btnHistory', 'Game history', 'image', '~160 x 160'),
        asset('btnMyBets', 'My bets', 'image', '~160 x 160'),
        asset('btnRanking', 'Ranking (trophy)', 'image', '~160 x 160'),
        asset('btnRepeat', 'Repeat bet button (includes its text)', 'image', '~312 x 208'),
      ],
    },
    {
      id: 'effects', title: 'Animations & effects', description: 'Optional full-screen effects. Leave empty for the built-in particle effects.',
      fields: [
        asset('fxIdle', 'Ambient loop behind the wheel', 'media', 'Short looping video (WebM with transparency recommended), animated SVG-free sprite sheet, or PNG.'),
        asset('fxWin', 'Win celebration', 'media', 'Plays over the screen when the player wins. Video (mp4/webm) or sprite sheet.'),
        asset('fxJackpot', 'Lucky 77 / bonus celebration', 'media', 'Plays when the lucky option hits.'),
      ],
    },
    {
      id: 'audio', title: 'Sound', description: 'Leave empty to use the built-in synthesized sounds.',
      fields: [
        asset('music', 'Background music (loops)', 'audio', 'MP3 / OGG / WAV / M4A, up to 4 MB'),
        asset('sfxSpin', 'Wheel spin', 'audio', 'Short sound'),
        asset('sfxTick', 'Pointer tick', 'audio', 'Very short sound'),
        asset('sfxChip', 'Chip placed', 'audio', 'Very short sound'),
        asset('sfxWin', 'Win', 'audio', 'Short sound'),
        asset('sfxLose', 'No win', 'audio', 'Short sound'),
      ],
    },
    {
      id: 'texts', title: 'Texts', description: 'Every word shown in the game.',
      fields: [
        { key: 'texts.roundLabel', label: 'Round label', type: 'text' },
        { key: 'texts.placeBets', label: 'Betting phase message', type: 'text' },
        { key: 'texts.noMoreBets', label: 'Betting closed message', type: 'text' },
        { key: 'texts.repeatBet', label: 'Repeat button text (when using no image)', type: 'text' },
        { key: 'texts.howToPlayTitle', label: 'How to play: title', type: 'text' },
        { key: 'texts.howToPlay', label: 'How to play: steps', type: 'textlist', help: 'One step per line.' },
        { key: 'texts.goodLuckTitle', label: 'Winners popup: title', type: 'text' },
        { key: 'texts.goodLuckBody', label: 'Winners popup: message', type: 'text' },
        { key: 'texts.historyTitle', label: 'History popup: title', type: 'text' },
        { key: 'texts.myBetsTitle', label: 'My bets popup: title', type: 'text' },
        { key: 'texts.rankingTitle', label: 'Ranking popup: title', type: 'text' },
      ],
    },
  ],
  validate(cfg) {
    const ids = (cfg.targets || []).map((t: any) => t.id);
    if (ids.some((i: string) => !/^[a-z0-9_]{1,16}$/.test(i))) return 'Option codes use a-z, 0-9 and _ (max 16 characters)';
    if (new Set(ids).size !== ids.length) return 'Option codes must be unique';
    const segs = cfg.segments || [];
    if (segs.some((s: any) => !ids.includes(s.target))) return 'Every wheel segment must use an existing option code';
    if (!segs.some((s: any) => (s.weight ?? 1) > 0)) return 'At least one wheel segment needs a weight above 0';
    const vals = (cfg.chips || []).map((c: any) => c.value);
    if (new Set(vals).size !== vals.length) return 'Chip values must be different';
    return null;
  },
};

export const GAMES: GameDef[] = [lucky];
export const gameBySlug = (slug: string) => GAMES.find(g => g.slug === slug);

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
