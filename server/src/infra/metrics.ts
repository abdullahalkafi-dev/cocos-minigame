import { monitorEventLoopDelay } from 'node:perf_hooks';

/** Cheap process metrics for load tests and production checks: event-loop delay, CPU and memory. */
export function createMetrics() {
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  let lastCpu = process.cpuUsage(), lastAt = Date.now();
  return {
    snapshot() {
      const now = Date.now(), cpu = process.cpuUsage(lastCpu);
      const wallMs = Math.max(1, now - lastAt);
      const out = {
        uptimeSec: Math.round(process.uptime()),
        cpuPercent: Math.round(((cpu.user + cpu.system) / 1000 / wallMs) * 1000) / 10,        // since the previous snapshot
        rssMB: Math.round(process.memoryUsage().rss / 1048576),
        eventLoopDelayMs: { mean: Math.round(h.mean / 1e4) / 100, p95: Math.round(h.percentile(95) / 1e4) / 100, max: Math.round(h.max / 1e4) / 100 },
      };
      lastCpu = process.cpuUsage(); lastAt = now; h.reset();
      return out;
    },
    stop() { h.disable(); },
  };
}
export type Metrics = ReturnType<typeof createMetrics>;
