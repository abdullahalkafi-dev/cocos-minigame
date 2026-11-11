import { _decorator, Component, Node } from 'cc';

const { ccclass } = _decorator;
type Fn = (dt: number) => boolean | void;

/** One per-frame hook for everything that animates every frame (wheel angle, video textures, sprite sheets). */
@ccclass('Ticker')
export class Ticker extends Component {
  private static inst: Ticker | null = null;
  private fns = new Set<Fn>();

  static install(host: Node): Ticker {
    const t = host.addComponent(Ticker);
    Ticker.inst = t;
    return t;
  }
  /** Register a callback. Return `true` from it to unregister. Returns a function that unregisters. */
  static add(fn: Fn): () => void {
    const t = Ticker.inst;
    if (!t) return () => undefined;
    t.fns.add(fn);
    return () => t.fns.delete(fn);
  }
  update(dt: number) {
    if (!this.fns.size) return;
    for (const fn of Array.from(this.fns)) {
      let remove = false;
      try { remove = fn(dt) === true; } catch (e) { console.error(e); remove = true; }
      if (remove) this.fns.delete(fn);
    }
  }
}
