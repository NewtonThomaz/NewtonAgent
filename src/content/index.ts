/**
 * NeuroPilot — Content Script (DOM Agent)
 *
 * Runs in the ISOLATED world (MV3 default): invisible to page scripts, immune to page CSP and
 * to Brave Shields script blocking. It NEVER performs network requests and never sees the API key:
 * it only perceives (distills the DOM) and acts (dispatches native events) on behalf of the worker.
 */
import { isContentRequest, type ContentRequest, type ContentResponseMap, type Envelope } from '../shared/messages';
import { errorMessage } from '../shared/utils';
import { distillPage } from './distiller';
import { executeAction } from './executor';
import { clearHighlight } from './overlay';
import { waitForStable } from './stability';

declare global {
  interface Window {
    __NEWTON_AGENT_CS__?: boolean;
  }
}

async function handle<T extends ContentRequest>(msg: T): Promise<ContentResponseMap[T['type']]> {
  type R = ContentResponseMap[T['type']];
  switch (msg.type) {
    case 'CS/PING':
      return { ready: true, url: location.href } as R;
    case 'CS/SNAPSHOT':
      return distillPage(msg.maxNodes) as R;
    case 'CS/EXECUTE':
      return (await executeAction(msg.action, msg.label)) as R;
    case 'CS/WAIT_STABLE':
      return (await waitForStable(msg.timeoutMs, msg.quietMs)) as R;
    case 'CS/CLEAR_OVERLAY':
      clearHighlight();
      return { cleared: true } as R;
    default:
      throw new Error(`Mensagem não suportada: ${(msg as { type: string }).type}`);
  }
}

function bootstrap(): void {
  // Idempotent: the worker may re-inject via chrome.scripting when the declarative injection is missing
  // (tabs opened before install). The isolated world's `window` persists, so the flag guards duplicates.
  if (window.__NEWTON_AGENT_CS__) return;
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;
  window.__NEWTON_AGENT_CS__ = true;

  chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse: (r: Envelope<unknown>) => void) => {
    if (!isContentRequest(msg)) return false;
    handle(msg).then(
      (data) => sendResponse({ ok: true, data }),
      (err: unknown) => sendResponse({ ok: false, error: errorMessage(err) }),
    );
    return true; // keep the channel open for the async response
  });
}

bootstrap();
