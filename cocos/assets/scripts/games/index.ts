import { Game, GameCtx } from '../core/GameBase';
import { LuckySpin } from './LuckySpin';
import { Lucky77 } from './Lucky77';
import { Ludo } from './Ludo';

type GameClass = new (ctx: GameCtx) => Game;
/** slug (from the server catalog) -> game implementation */
export const GAMES: Record<string, GameClass> = {
  'lucky-spin': LuckySpin,
  'lucky-77': Lucky77,
  'ludo': Ludo,
};
