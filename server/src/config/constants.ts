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
