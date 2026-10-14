import type { Envelope, PanelRequest, PanelResponseMap } from '../../shared/messages';

/**
 * Sends a strongly-typed request to the Background Service Worker.
 */
export async function sendToBackground<T extends PanelRequest>(
  msg: T,
): Promise<PanelResponseMap[T['type']]> {
  const response = (await chrome.runtime.sendMessage(msg)) as Envelope<PanelResponseMap[T['type']]> | undefined;

  if (!response) {
    throw new Error('O Service Worker de fundo não retornou uma resposta.');
  }

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.data;
}

/**
 * Finds the actual active user tab to automate.
 * Handles normal sidePanel as well as the popup window fallback (where currentWindow is the popup).
 */
export async function getTargetTab(): Promise<chrome.tabs.Tab> {
  // 1. Try querying active tab in the last focused normal window
  const normalWindows = await chrome.windows.getAll({ windowTypes: ['normal'] });
  const focusedNormal = normalWindows.find((w) => w.focused) || normalWindows[0];

  if (focusedNormal && focusedNormal.id !== undefined) {
    const tabs = await chrome.tabs.query({ active: true, windowId: focusedNormal.id });
    const tab = tabs[0];
    if (tab && !tab.url?.startsWith('chrome-extension://')) {
      return tab;
    }
  }

  // 2. Fallback query
  const allActive = await chrome.tabs.query({ active: true });
  const candidates = allActive.filter((t) => t.url && !t.url.startsWith('chrome-extension://'));

  if (candidates[0]) {
    return candidates[0];
  }

  throw new Error('Nenhuma aba ativa para automação foi encontrada. Abra uma página normal no navegador.');
}
