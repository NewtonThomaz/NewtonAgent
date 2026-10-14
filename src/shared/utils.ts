export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const randomBetween = (min: number, max: number): number => Math.round(min + Math.random() * (max - min));

export function uid(prefix = 'id'): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rnd}`;
}

/** Collapses whitespace and truncates with an ellipsis. */
export function cleanText(input: string | null | undefined, max = 160): string {
  if (!input) return '';
  const text = input.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function truncate(input: string, max: number): string {
  return input.length > max ? `${input.slice(0, max - 1)}…` : input;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Detects errors caused by Chrome BFCache, navigation, or closed IPC message channel. */
export function isChannelClosedOrNavigationError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  return (
    msg.includes('back/forward cache') ||
    msg.includes('message channel is closed') ||
    msg.includes('message channel closed') ||
    msg.includes('receiving end does not exist') ||
    msg.includes('could not establish connection') ||
    msg.includes('frame with id 0 was removed') ||
    msg.includes('frame was removed')
  );
}

/** Small, fast, non-cryptographic hash (FNV-1a) used to detect "page did not change". */
export function quickHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** Races a promise against a timeout. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
