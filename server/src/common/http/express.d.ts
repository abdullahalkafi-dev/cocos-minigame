import type { UserRec } from '../../modules/users/user.model.js';
import type { GameRec } from '../../modules/games/game.model.js';
import type { PlayerRec } from '../../modules/players/player.model.js';

export interface SessionClaims { t: string; lic: string; u?: string; pid?: string; pv?: number }

declare global {
  namespace Express {
    interface Request {
      /** Dashboard user (set by requireUser). */
      user?: UserRec;
      /** Account that owns the API key (set by requireApiKey). */
      account?: UserRec;
      /** Game from :id, owned by req.user (set by requireOwnedGame). */
      game?: GameRec;
      /** Play session claims + the game they belong to (set by requireSession / requirePlayer). */
      session?: { claims: SessionClaims; game: GameRec };
      /** Logged-in player of a game (set by requirePlayer). */
      player?: PlayerRec;
    }
  }
}
export {};
