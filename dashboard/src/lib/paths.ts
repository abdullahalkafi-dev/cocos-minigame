export type GameTab = 'customize' | 'integrate' | 'players' | 'settings';

/**
 * Address of a game's page in the dashboard. The dashboard is a static export, so the game id travels in the
 * query string. (The server also redirects the older /games/<id>/<tab> form here.)
 */
export const gamePath = (id: string, tab: GameTab = 'customize') => `/game?id=${encodeURIComponent(id)}&tab=${tab}`;
