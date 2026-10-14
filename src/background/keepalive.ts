/**
 * MV3 service workers are terminated after ~30s without extension events. Long LLM calls
 * (e.g. Nemotron Ultra with reasoning) can exceed that, so while a mission runs we call a cheap
 * extension API every 20s — since Chrome 110 every extension API call resets the idle timer.
 * Each individual fetch is additionally capped by `requestTimeoutMs` (< 5 min hard limit).
 */
let timer: ReturnType<typeof setInterval> | null = null;

export function startKeepAlive(): void {
  if (timer) return;
  timer = setInterval(() => {
    void chrome.runtime.getPlatformInfo();
  }, 20_000);
}

export function stopKeepAlive(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
