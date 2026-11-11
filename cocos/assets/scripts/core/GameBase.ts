import { Node } from 'cc';
import { Api, Player } from './Api';
import { Hud, Theme } from './Hud';
import { ParticleLayer } from './Particles';

export interface GameCtx {
  stage: Node;          // game content (centered 720-wide column)
  uiLayer: Node;        // modals / toasts, above fx
  fx: ParticleLayer;    // confetti, coins, sparks
  api: Api;
  cfg: any;             // merged, buyer-customised config from the server
  player: Player;
  hud: Hud;
  theme: Theme;
  vw: number;           // visible width in design units (height is always 1280)
  vh: number;           // visible height in stage units (1280, or more on narrow screens where the stage is scaled down)
  loader?: { set(p: number): void };
}

export abstract class Game {
  constructor(public ctx: GameCtx) {}
  abstract start(): Promise<void> | void;
}
