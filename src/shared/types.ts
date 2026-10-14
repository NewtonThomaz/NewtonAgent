/**
 * Domain model shared by the three extension contexts:
 * Side Panel (UI) · Background Service Worker (orchestrator) · Content Script (DOM agent).
 */

/* ───────────────────────────── Settings (BYOK) ───────────────────────────── */

export type ProviderKind = 'openai' | 'gemini';

export interface AgentSettings {
  /** `openai` = any OpenAI-compatible /chat/completions endpoint (OpenAI, NVIDIA NIM, Ollama, OpenRouter…). */
  provider: ProviderKind;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  /** Sends `response_format: {type:'json_object'}` (OpenAI) / `responseMimeType` (Gemini). Auto-fallback if rejected. */
  jsonMode: boolean;
  /** Nemotron: `detailed thinking on`. Slower but more accurate reasoning. */
  reasoning: boolean;
  maxSteps: number;
  actionDelayMs: number;
  settleTimeoutMs: number;
  requestTimeoutMs: number;
  extraInstructions: string;
}

/* ───────────────────────────── Session / Chat ───────────────────────────── */

export type AgentStatus = 'idle' | 'running' | 'paused' | 'stopping' | 'completed' | 'stopped' | 'error';

export type LogKind = 'user' | 'observe' | 'thought' | 'action' | 'result' | 'system' | 'error' | 'success';

export interface ChatLogEntry {
  id: string;
  kind: LogKind;
  text: string;
  timestamp: number;
  step?: number;
  ok?: boolean;
}

export interface SessionState {
  status: AgentStatus;
  goal: string | null;
  tabId: number | null;
  step: number;
  maxSteps: number;
  startedAt: number | null;
  finishedAt: number | null;
  logs: ChatLogEntry[];
}

/* ───────────────────────────── Distilled DOM ───────────────────────────── */

export interface DistilledOption {
  value: string;
  text: string;
  selected: boolean;
}

export interface DistilledText {
  kind: 'text';
  tag: string;
  text: string;
}

export interface DistilledElement {
  kind: 'element';
  /** Value of the temporary `data-ai-id` attribute. Valid only for the snapshot that produced it. */
  id: number;
  tag: string;
  role: string;
  name: string;
  inputType?: string;
  value?: string;
  placeholder?: string;
  checked?: boolean;
  selected?: boolean;
  disabled?: boolean;
  required?: boolean;
  expanded?: boolean;
  group?: string;
  href?: string;
  options?: DistilledOption[];
  inViewport: boolean;
}

export type DistilledNode = DistilledText | DistilledElement;

export interface PageSnapshot {
  url: string;
  title: string;
  scroll: { y: number; height: number; viewport: number };
  nodes: DistilledNode[];
  interactiveCount: number;
  truncated: boolean;
  capturedAt: number;
}

/* ───────────────────────────── Agent actions / LLM payload ───────────────────────────── */

export type AgentAction =
  | { type: 'click'; targetId: number }
  | { type: 'type'; targetId: number; value: string; clear?: boolean; pressEnter?: boolean }
  | { type: 'select'; targetId: number; value: string }
  | { type: 'check'; targetId: number; checked: boolean }
  | { type: 'hover'; targetId: number }
  | { type: 'press_key'; key: string; targetId?: number }
  | { type: 'scroll'; direction: 'up' | 'down'; targetId?: number; amount?: number }
  | { type: 'wait'; ms: number }
  | { type: 'navigate'; url: string };

export type ActionType = AgentAction['type'];

export const ACTION_TYPES: readonly ActionType[] = [
  'click',
  'type',
  'select',
  'check',
  'hover',
  'press_key',
  'scroll',
  'wait',
  'navigate',
] as const;

export type ActionErrorCode = 'stale' | 'not_found' | 'invalid' | 'error';

export interface ActionResult {
  ok: boolean;
  message: string;
  navigated?: boolean;
  code?: ActionErrorCode;
}

/** Strict JSON contract the LLM must return on every step. */
export interface AgentDecision {
  thought: string;
  goal_achieved: boolean;
  actions: AgentAction[];
  final_answer?: string;
}
