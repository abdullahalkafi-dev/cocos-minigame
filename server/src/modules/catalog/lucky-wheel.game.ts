import type { AssetKind, Field, GameDef } from './catalog.types.js';

// Lucky Wheel 77: defaults (what a new buyer gets) and the manifest (what the dashboard lets them change).
const D = '/defaults/lucky-wheel/';
const img = (file: string) => ({ url: D + file });
const asset = (key: string, label: string, kind: AssetKind, hint: string): Field => ({ key: `assets.${key}`, label, type: 'asset', kind, hint });

// ------------------------------------------------------------------ Lucky Wheel 77
export const luckyWheel: GameDef = {
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
