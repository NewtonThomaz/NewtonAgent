import { isRestrictedUrl } from '../shared/constants';
import type { ContentRequest, ContentResponseMap, Envelope } from '../shared/messages';
import { sleep, withTimeout } from '../shared/utils';

/** Typed request → response call to the content script of the top frame. */
export async function sendToTab<T extends ContentRequest>(
  tabId: number,
  msg: T,
  timeoutMs = 30_000,
): Promise<ContentResponseMap[T['type']]> {
  const response = (await withTimeout(
    chrome.tabs.sendMessage(tabId, msg, { frameId: 0 }) as Promise<Envelope<ContentResponseMap[T['type']]> | undefined>,
    timeoutMs,
    `O content script não respondeu a ${msg.type} em ${Math.round(timeoutMs / 1000)}s.`,
  )) as Envelope<ContentResponseMap[T['type']]> | undefined;
  if (!response) throw new Error('Resposta vazia do content script.');
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

export async function getTab(tabId: number): Promise<chrome.tabs.Tab> {
  try {
    return await chrome.tabs.get(tabId);
  } catch {
    throw new Error('A aba alvo foi fechada.');
  }
}

/**
 * Guarantees a live content script in the tab. The manifest injects it declaratively, but tabs
 * opened *before* install/update don't have it — in that case inject programmatically.
 */
export async function ensureContentScript(tabId: number): Promise<void> {
  const tab = await getTab(tabId);
  if (isRestrictedUrl(tab.url)) {
    throw new Error(`O navegador não permite automação nesta página (${tab.url ?? 'URL desconhecida'}).`);
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await sendToTab(tabId, { type: 'CS/PING' }, 1500);
      return;
    } catch {
      if (attempt === 0 || attempt === 2) {
        try {
          await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['content.js'] });
        } catch (err) {
          if (attempt === 2) throw new Error(`Falha ao injetar o content script: ${(err as Error).message}`);
        }
      }
      await sleep(250 * (attempt + 1));
    }
  }
  throw new Error('Não foi possível conectar ao content script desta página.');
}

/** Waits until the tab finishes loading (after a full navigation). Always resolves. */
export async function waitForTabComplete(tabId: number, timeoutMs = 20_000): Promise<void> {
  await sleep(150);
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || tab.status === 'complete') return;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') done();
    };
    const timer = setTimeout(done, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
  });
  await sleep(250);
}

const stripHash = (url: string | undefined): string => (url ?? '').split('#')[0] ?? '';

/** Detects a navigation (full load or SPA route change) caused by the last action. */
export async function detectNavigation(tabId: number, urlBefore: string | undefined): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return false;
  return tab.status === 'loading' || stripHash(tab.url) !== stripHash(urlBefore);
}
