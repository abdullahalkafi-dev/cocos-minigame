export interface LudoConfig { entryFee: number; firstMultiplier: number; secondMultiplier: number }
/** Payout for a finished match based on final placement (1-4). */
export function ludoPayout(cfg: LudoConfig, placement: number): number {
  if (placement === 1) return Math.floor(cfg.entryFee * cfg.firstMultiplier);
  if (placement === 2) return Math.floor(cfg.entryFee * cfg.secondMultiplier);
  return 0;
}
