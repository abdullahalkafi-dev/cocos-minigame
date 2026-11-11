import { director, Director, Canvas, Camera, UITransform, Layers, view, ResolutionPolicy, Color, Scene, tween } from 'cc';
import { Api, ApiError, Player } from './core/Api';
import { Background } from './core/Background';
import { GameCtx } from './core/GameBase';
import { Hud, Theme } from './core/Hud';
import { showFatal, showLogin } from './core/Login';
import { ParticleLayer } from './core/Particles';
import { Sfx } from './core/Sfx';
import { Ticker } from './core/Ticker';
import { Loader } from './core/Loader';
import { emit } from './core/Host';
import { hex, mk, ensureOpacity } from './core/Util';
import { label } from './core/Widgets';
import { GAMES } from './games';

const DESIGN_H = 1280;

async function start() {
  const scene = director.getScene() as Scene;
  view.setDesignResolutionSize(720, DESIGN_H, ResolutionPolicy.FIXED_HEIGHT);

  // ---- canvas + camera ----
  const canvasNode = mk('Canvas', scene);
  const canvas = canvasNode.addComponent(Canvas);
  const camNode = mk('Camera', canvasNode, 0, 0);
  camNode.setPosition(0, 0, 1000);
  const cam = camNode.addComponent(Camera);
  cam.projection = Camera.ProjectionType.ORTHO;
  cam.orthoHeight = DESIGN_H / 2;
  cam.visibility = Layers.Enum.UI_2D;
  cam.clearFlags = Camera.ClearFlag.SOLID_COLOR;
  cam.clearColor = new Color(14, 12, 30, 255);
  canvas.cameraComponent = cam;
  Ticker.install(canvasNode);
  const vis = () => view.getVisibleSize();
  canvasNode.getComponent(UITransform)!.setContentSize(vis().width, DESIGN_H);

  const unlock = () => Sfx.unlock();
  ['pointerdown', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { passive: true }));

  // ---- loading indicator ----
  const loadingNode = mk('loading', canvasNode, 0, 0);
  const loadingLabel = label(loadingNode, 'Loading…', 40, '#ffffff', { bold: true });
  tween(ensureOpacity(loadingLabel.node)).repeatForever(tween().to(0.6, { opacity: 90 }).to(0.6, { opacity: 255 })).start();

  const api = new Api();
  let boot;
  try { boot = await api.bootstrap(); } catch (e) {
    showFatal(e instanceof ApiError ? e.message : 'Could not load the game.');
    return;
  }
  const cfg = boot.config;
  const theme: Theme = { primary: '#7c3aed', secondary: '#fbbf24', background: '#14052e', text: '#ffffff', popup: '#2b0f73', accent: '#facc15', ...(cfg.theme || {}) };
  cfg.theme = theme;
  cam.clearColor = hex(theme.background);
  document.body.style.background = theme.background;
  document.title = cfg.title || document.title;
  loadingNode.destroy();

  // ---- layers ----
  let vw = vis().width;
  const bg = new Background(canvasNode, cfg, vw, DESIGN_H);
  const stage = mk('stage', canvasNode, 0, 0, 720, DESIGN_H);
  const fxNode = mk('fx', canvasNode, 0, 0, 720, DESIGN_H);
  const fx = fxNode.addComponent(ParticleLayer);
  const uiLayer = mk('ui', canvasNode, 0, 0, 720, DESIGN_H);
  // Game content is laid out for a 720-wide column. On narrower screens (tall phones) scale it down to fit.
  const fit = () => {
    vw = vis().width;
    const s = Math.min(1, (vw - 8) / 720);
    [stage, fxNode, uiLayer].forEach(n => n.setScale(s, s, 1));
    bg.relayout(vw, DESIGN_H);
    canvasNode.getComponent(UITransform)!.setContentSize(vw, DESIGN_H);
  };
  fit();
  view.on('canvas-resize', fit);

  // ---- username ----
  let player: Player | null = boot.player;
  if (!player) await showLogin(cfg, async name => { player = await api.login(name); });
  if (!player) { showFatal('Could not sign in.'); return; }
  emit('login', { username: player.username, balance: player.balance });

  const loader = new Loader(canvasNode, cfg.title || 'Loading', theme);
  const hud = new Hud(cfg, theme, player, api, uiLayer);
  const stageScale = Math.min(1, (vw - 8) / 720);
  // the stage is scaled down on narrow screens, so it has more vertical room than 1280 design units
  const ctx: GameCtx = { stage, uiLayer, fx, api, cfg, player, hud, theme, vw, vh: DESIGN_H / stageScale, loader };

  const GameClass = GAMES[boot.game];
  if (!GameClass) { showFatal(`Unknown game "${boot.game}".`, false); return; }
  try {
    await new GameClass(ctx).start();
    loader.done();
    emit('ready', { game: boot.game });
  } catch (e) {
    console.error(e);
    showFatal('The game failed to start. Please reload.');
  }
}

director.once(Director.EVENT_AFTER_SCENE_LAUNCH, () => { start().catch(e => { console.error(e); showFatal('Unexpected error: ' + (e as Error).message); }); });
