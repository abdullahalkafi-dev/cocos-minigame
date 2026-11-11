import { EventEmitter } from 'node:events';

/**
 * In-process events between modules that must not import each other.
 *  - "balance" (playerId, balance): a player's balance changed outside the game (wallet API, refill, seamless credit),
 *    so the live game connection can show the new number straight away.
 */
export interface Bus extends EventEmitter {
  emit(event: 'balance', playerId: string, balance: number): boolean;
  on(event: 'balance', listener: (playerId: string, balance: number) => void): this;
}
export const createBus = (): Bus => { const b = new EventEmitter() as Bus; b.setMaxListeners(50); return b; };
