import { isOverlayNode } from './overlay';

export interface StabilityResult {
  stable: boolean;
  waitedMs: number;
}

/**
 * Resolves once the page has been "quiet" for `quietMs`:
 *  - no DOM mutations (MutationObserver, ignoring our own overlay),
 *  - no newly finished network resources (PerformanceObserver 'resource'),
 *  - document.readyState === 'complete'.
 * Always resolves by `timeoutMs` (pages with clocks/animations never go fully quiet).
 */
export function waitForStable(timeoutMs = 6000, quietMs = 450): Promise<StabilityResult> {
  return new Promise((resolve) => {
    const start = performance.now();
    let done = false;
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    let perf: PerformanceObserver | undefined;

    const finish = (stable: boolean): void => {
      if (done) return;
      done = true;
      clearTimeout(quietTimer);
      clearTimeout(hardTimer);
      mutation.disconnect();
      perf?.disconnect();
      resolve({ stable, waitedMs: Math.round(performance.now() - start) });
    };

    const bump = (): void => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => {
        if (document.readyState === 'complete') finish(true);
        else bump();
      }, quietMs);
    };

    const mutation = new MutationObserver((records) => {
      if (records.some((r) => !isOverlayNode(r.target))) bump();
    });
    mutation.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });

    try {
      perf = new PerformanceObserver(() => bump());
      perf.observe({ type: 'resource', buffered: false });
    } catch {
      /* PerformanceObserver unavailable — DOM signal only */
    }

    const hardTimer = setTimeout(() => finish(false), timeoutMs);
    bump();
  });
}
