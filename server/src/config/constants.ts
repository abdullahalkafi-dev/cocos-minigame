/** Demo credits a new buyer account starts with (used to "buy" games in the store). */
export const SIGNUP_CREDITS = 10_000;
export const TOPUP_CREDITS = 5_000;
/** Lifetime of the play session handed out by POST /api/v1/sessions. */
export const SESSION_TTL_SEC = 15 * 60;
/** Lifetime of the player token a game keeps after login. */
export const PLAYER_TTL_SEC = 12 * 3600;
export const USER_TOKEN_TTL_SEC = 7 * 86400;
/** A name a player types (or a client passes) for the free username flow. */
export const USERNAME_RE = /^[A-Za-z0-9_.-]{3,20}$/;
/** Cache lifetime of a game record; invalidated on every change anyway. */
export const GAME_CACHE_TTL_SEC = 60;
/** An id the client's own system uses for a person: letters, digits and _ . : @ - (1 to 64 characters). */
export const PLAYER_ID_RE = /^[A-Za-z0-9_.:@-]{1,64}$/;
export const DISPLAY_NAME_MAX = 40;
export const AVATAR_URL_MAX = 300;
export const MAX_AMOUNT = 1_000_000_000_000;
export type WalletMode = 'demo' | 'managed' | 'seamless';
export type GameMode = 'live' | 'test';
export const MAIN_ROOM = 'main';
/** A player counts as being in a room for this long after they were last seen there. */
export const PRESENCE_WINDOW_SEC = 45;
export const ROOM_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const MAX_ROOMS_PER_GAME = 200;
