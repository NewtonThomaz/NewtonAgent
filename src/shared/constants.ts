import type { AgentSettings, ProviderKind, SessionState } from './types';

export const PORT_NAME = 'newtonagent-panel';

export const STORAGE_KEYS = {
  settings: 'newtonagent.settings',
  session: 'newtonagent.session',
} as const;

export const MAX_LOG_ENTRIES = 400;
export const MAX_ACTIONS_PER_STEP = 12;
export const MAX_SNAPSHOT_NODES = 700;
export const MAX_SNAPSHOT_CHARS = 45_000;
export const HISTORY_WINDOW = 12;

export interface ProviderPreset {
  id: 'nvidia' | 'openai' | 'gemini' | 'custom';
  label: string;
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  hint: string;
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    provider: 'openai',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
    hint: 'Chave em build.nvidia.com (formato nvapi-…). Endpoint OpenAI-compatible.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    hint: 'Chave em platform.openai.com (formato sk-…).',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    hint: 'Chave em aistudio.google.com/apikey. Usa a API nativa generateContent.',
  },
  {
    id: 'custom',
    label: 'Custom',
    provider: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    hint: 'Qualquer endpoint OpenAI-compatible (Ollama, LM Studio, OpenRouter, vLLM…).',
  },
] as const;

export const DEFAULT_SETTINGS: AgentSettings = {
  provider: 'openai',
  apiKey: '',
  baseUrl: PROVIDER_PRESETS[0]!.baseUrl,
  model: PROVIDER_PRESETS[0]!.model,
  temperature: 0.2,
  maxTokens: 4096,
  jsonMode: true,
  reasoning: false,
  maxSteps: 40,
  actionDelayMs: 350,
  settleTimeoutMs: 6000,
  requestTimeoutMs: 180_000,
  extraInstructions: '',
};

export const SETTINGS_LIMITS = {
  temperature: { min: 0, max: 2 },
  maxTokens: { min: 256, max: 32_768 },
  maxSteps: { min: 1, max: 200 },
  actionDelayMs: { min: 0, max: 5000 },
  settleTimeoutMs: { min: 500, max: 30_000 },
  requestTimeoutMs: { min: 10_000, max: 280_000 },
} as const;

export function createInitialSession(): SessionState {
  return {
    status: 'idle',
    goal: null,
    tabId: null,
    step: 0,
    maxSteps: DEFAULT_SETTINGS.maxSteps,
    startedAt: null,
    finishedAt: null,
    logs: [],
  };
}

/** URLs where Chromium (and Brave) forbid content-script injection. */
const RESTRICTED_URL_PATTERNS: readonly RegExp[] = [
  /^(chrome|brave|edge|opera|vivaldi|about|devtools|view-source|chrome-extension|chrome-search|chrome-untrusted):/i,
  /^https:\/\/chromewebstore\.google\.com\//i,
  /^https:\/\/chrome\.google\.com\/webstore/i,
  /^https:\/\/microsoftedge\.microsoft\.com\/addons/i,
];

export function isRestrictedUrl(url: string | undefined | null): boolean {
  if (!url) return true;
  if (!/^(https?|file):/i.test(url)) return true;
  return RESTRICTED_URL_PATTERNS.some((re) => re.test(url));
}
