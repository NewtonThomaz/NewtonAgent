import { PORT_NAME } from '../shared/constants';
import { isPanelRequest, type Envelope, type PanelRequest, type PanelResponseMap } from '../shared/messages';
import { errorMessage } from '../shared/utils';
import { AgentRunner } from './agent-loop';
import { LLMClient } from './llm/client';
import { SessionStore } from './session';
import { setupSidePanel } from './sidepanel-setup';
import { assertConfigured, loadSettings, saveSettings } from './storage';

const session = new SessionStore();
const runner = new AgentRunner(session);
const llm = new LLMClient();

// Configure Side Panel behavior immediately
setupSidePanel();

// Hydrate session on startup
void session.hydrate();

// Connection port for the Side Panel UI (real-time streaming of events & state)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === PORT_NAME) {
    session.attach(port);
  }
});

// Message handler for Side Panel commands
async function handlePanelRequest<T extends PanelRequest>(msg: T): Promise<PanelResponseMap[T['type']]> {
  type R = PanelResponseMap[T['type']];

  switch (msg.type) {
    case 'PANEL/GET_STATE':
      return session.snapshot as R;

    case 'PANEL/START': {
      const settings = await loadSettings();
      assertConfigured(settings);
      // Run asynchronously in the background so the response returns immediately
      void runner.start(msg.goal, msg.tabId, settings, msg.maxSteps);
      return { started: true } as R;
    }

    case 'PANEL/PAUSE':
      runner.pause();
      return { status: session.snapshot.status } as R;

    case 'PANEL/RESUME':
      runner.resume();
      return { status: session.snapshot.status } as R;

    case 'PANEL/STOP':
      runner.stop();
      return { status: session.snapshot.status } as R;

    case 'PANEL/CLEAR':
      if (runner.isRunning) {
        runner.stop();
      }
      return session.clear() as R;

    case 'PANEL/GET_SETTINGS':
      return (await loadSettings()) as R;

    case 'PANEL/SAVE_SETTINGS':
      return (await saveSettings(msg.settings)) as R;

    case 'PANEL/TEST_CONNECTION':
      return (await llm.testConnection(msg.settings)) as R;

    default:
      throw new Error(`Tipo de requisição desconhecido: ${(msg as { type: string }).type}`);
  }
}

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse: (r: Envelope<unknown>) => void) => {
  if (!isPanelRequest(msg)) return false;

  handlePanelRequest(msg).then(
    (data) => sendResponse({ ok: true, data }),
    (err: unknown) => sendResponse({ ok: false, error: errorMessage(err) }),
  );

  return true; // Keep channel open for async response
});

// Lifecycle events
chrome.runtime.onInstalled.addListener(() => {
  setupSidePanel();
  console.log('[NewtonAgent] Extensão instalada/atualizada com sucesso.');
});

chrome.runtime.onStartup.addListener(() => {
  setupSidePanel();
  void session.hydrate();
});
