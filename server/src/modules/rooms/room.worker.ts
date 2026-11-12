import type { Cache } from '../../infra/cache.js';
import type { RoomService } from './room.service.js';

/** Once a minute: deletes the rooms that asked to be removed when empty. A lock keeps several servers from doing it at once. */
export function startRoomWorker(d: { rooms: RoomService; cache: Cache }) {
  const timer = setInterval(async () => {
    const release = await d.cache.lock('rooms:cleanup', 50_000);
    if (!release) return;
    try { await d.rooms.cleanup(); } catch (e) { console.error('room cleanup', e); }   // the lock expires by itself
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
