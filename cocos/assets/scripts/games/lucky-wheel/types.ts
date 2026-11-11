import type { Label, Node } from 'cc';
import type { GameCtx } from '../../core/GameBase';
import type { AssetRef } from '../../core/Media';

/** A thing players can bet on (one box on the screen). */
export interface Target { id: string; label: string; multiplier: number; lucky: boolean; icon?: AssetRef; badge?: AssetRef }
export interface ChipCfg { value: number; image?: AssetRef }
/** The nodes that make up one bet box. */
export interface BoxView { node: Node; w: number; h: number; pot: Label; mine: Label; glow: Node; stack: Node; lastCount: number }

/** What the visual helpers (effects) read from the running game. */
export interface WheelScene {
  ctx: GameCtx;
  targets: Target[];
  wy: number;
  bot: number;
  disc: Node;
  hubR: number;
  gemGlow: Node | null;
  gemLocalY: number;
  boxes: Map<string, BoxView>;
  chipNodes: { node: Node; glow: Node }[];
  selected: number;
}
