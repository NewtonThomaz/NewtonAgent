import type {
  ActionResult,
  AgentAction,
  AgentSettings,
  AgentStatus,
  ChatLogEntry,
  PageSnapshot,
  SessionState,
} from './types';

/** Uniform response envelope for every request/response message. */
export type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

/* ═══════════════ Side Panel → Background (chrome.runtime.sendMessage) ═══════════════ */

export type PanelRequest =
  | { type: 'PANEL/GET_STATE' }
  | { type: 'PANEL/START'; goal: string; tabId: number; maxSteps?: number }
  | { type: 'PANEL/PAUSE' }
  | { type: 'PANEL/RESUME' }
  | { type: 'PANEL/STOP' }
  | { type: 'PANEL/CLEAR' }
  | { type: 'PANEL/GET_SETTINGS' }
  | { type: 'PANEL/SAVE_SETTINGS'; settings: AgentSettings }
  | { type: 'PANEL/TEST_CONNECTION'; settings: AgentSettings };

export interface PanelResponseMap {
  'PANEL/GET_STATE': SessionState;
  'PANEL/START': { started: true };
  'PANEL/PAUSE': { status: AgentStatus };
  'PANEL/RESUME': { status: AgentStatus };
  'PANEL/STOP': { status: AgentStatus };
  'PANEL/CLEAR': SessionState;
  'PANEL/GET_SETTINGS': AgentSettings;
  'PANEL/SAVE_SETTINGS': AgentSettings;
  'PANEL/TEST_CONNECTION': { latencyMs: number; sample: string };
}

export type PanelRequestType = PanelRequest['type'];

/* ═══════════════ Background → Side Panel (chrome.runtime.Port) ═══════════════ */

export type BackgroundEvent =
  | { type: 'BG/STATE'; state: SessionState }
  | { type: 'BG/LOG'; entry: ChatLogEntry }
  | { type: 'BG/STATUS'; status: AgentStatus; step: number; maxSteps: number };

export type PanelPortMessage = { type: 'PANEL/PING' };

/* ═══════════════ Background → Content Script (chrome.tabs.sendMessage) ═══════════════ */

export type ContentRequest =
  | { type: 'CS/PING' }
  | { type: 'CS/SNAPSHOT'; maxNodes?: number }
  | { type: 'CS/EXECUTE'; action: AgentAction; label?: string }
  | { type: 'CS/WAIT_STABLE'; timeoutMs: number; quietMs: number }
  | { type: 'CS/CLEAR_OVERLAY' };

export interface ContentResponseMap {
  'CS/PING': { ready: true; url: string };
  'CS/SNAPSHOT': PageSnapshot;
  'CS/EXECUTE': ActionResult;
  'CS/WAIT_STABLE': { stable: boolean; waitedMs: number };
  'CS/CLEAR_OVERLAY': { cleared: true };
}

export type ContentRequestType = ContentRequest['type'];

/* ═══════════════ Type guards ═══════════════ */

const PANEL_TYPES = new Set<string>([
  'PANEL/GET_STATE',
  'PANEL/START',
  'PANEL/PAUSE',
  'PANEL/RESUME',
  'PANEL/STOP',
  'PANEL/CLEAR',
  'PANEL/GET_SETTINGS',
  'PANEL/SAVE_SETTINGS',
  'PANEL/TEST_CONNECTION',
]);

const CONTENT_TYPES = new Set<string>(['CS/PING', 'CS/SNAPSHOT', 'CS/EXECUTE', 'CS/WAIT_STABLE', 'CS/CLEAR_OVERLAY']);

function hasType(msg: unknown): msg is { type: string } {
  return typeof msg === 'object' && msg !== null && typeof (msg as { type?: unknown }).type === 'string';
}

export function isPanelRequest(msg: unknown): msg is PanelRequest {
  return hasType(msg) && PANEL_TYPES.has(msg.type);
}

export function isContentRequest(msg: unknown): msg is ContentRequest {
  return hasType(msg) && CONTENT_TYPES.has(msg.type);
}

export function isBackgroundEvent(msg: unknown): msg is BackgroundEvent {
  return hasType(msg) && msg.type.startsWith('BG/');
}
