import type { GameDef } from './catalog.types.js';
import { luckyWheel } from './lucky-wheel.game.js';

export type { AssetKind, Field, FieldType, GameDef, Group } from './catalog.types.js';
export { ASSET_URL, fillAssetDefaults, getPath, sanitizeConfig, setPath } from './catalog.sanitize.js';

/** Every game type the store can sell. A new game = one new definition file + one line here. */
export const GAMES: GameDef[] = [luckyWheel];
export const gameBySlug = (slug: string) => GAMES.find(g => g.slug === slug);
