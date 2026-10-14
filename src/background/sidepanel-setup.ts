/**
 * Cross-browser setup for the Side Panel (Google Chrome & Brave Browser).
 *
 * Requirements:
 * 1. Attempt `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`.
 * 2. In Brave Browser or older Chromium builds where `setPanelBehavior` might fail or be ignored,
 *    register an `action.onClicked` fallback that calls `chrome.sidePanel.open({ windowId })`
 *    BEFORE any await to preserve the user-gesture token.
 * 3. Final fallback: `chrome.windows.create({ type: 'popup', url: 'sidepanel.html' })`.
 */
export function setupSidePanel(): void {
  // 1. Behavior configuration
  if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((err) => {
      console.warn('[NewtonAgent] setPanelBehavior not supported or failed:', err);
    });
  }

  // 2. Action click fallback (primarily for Brave Browser)
  chrome.action.onClicked.addListener((tab) => {
    const windowId = tab.windowId;

    if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function' && windowId !== undefined) {
      // Must call open() synchronously within the user-gesture handler!
      chrome.sidePanel.open({ windowId }).catch((err) => {
        console.warn('[NewtonAgent] chrome.sidePanel.open failed, falling back to popup window:', err);
        openFallbackWindow();
      });
    } else {
      openFallbackWindow();
    }
  });
}

function openFallbackWindow(): void {
  chrome.windows.getCurrent((win) => {
    const width = 440;
    const height = 750;
    const left = win?.left !== undefined && win?.width !== undefined ? win.left + win.width - width : undefined;
    const top = win?.top;

    chrome.windows.create({
      url: chrome.runtime.getURL('sidepanel.html'),
      type: 'popup',
      width,
      height,
      left,
      top,
      focused: true,
    });
  });
}
