import { Game, GameCtx } from '../core/GameBase';
import { LuckyWheel } from './lucky-wheel/LuckyWheel';

type GameClass = new (ctx: GameCtx) => Game;
/** slug (from the server catalog) -> game implementation */
export const GAMES: Record<string, GameClass> = {
  'lucky-wheel': LuckyWheel,
};
