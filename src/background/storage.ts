/**
 * Persistence layer — exclusively `chrome.storage.local`.
 * (`storage.sync` depends on a signed-in Google account / Brave Sync and is avoided on purpose.)
 */
import { DEFAULT_SETTINGS, SETTINGS_LIMITS, STORAGE_KEYS } from '../shared/constants';
import type { AgentSettings, SessionState } from '../shared/types';
import { clamp } from '../shared/utils';

function num(value: unknown, fallback: number, limits: { min: number; max: number }): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? clamp(n, limits.min, limits.max) : fallback;
}

/** Validates and normalizes untrusted settings coming from storage or the UI. */
export function sanitizeSettings(input: Partial<AgentSettings> | undefined | null): AgentSettings {
  const s = { ...DEFAULT_SETTINGS, ...(input ?? {}) };
  return {
    provider: s.provider === 'gemini' ? 'gemini' : 'openai',
    apiKey: String(s.apiKey ?? '').trim(),
    baseUrl: String(s.baseUrl ?? '').trim().replace(/\/+$/, ''),
    model: String(s.model ?? '').trim(),
    temperature: num(s.temperature, DEFAULT_SETTINGS.temperature, SETTINGS_LIMITS.temperature),
    maxTokens: Math.round(num(s.maxTokens, DEFAULT_SETTINGS.maxTokens, SETTINGS_LIMITS.maxTokens)),
    jsonMode: Boolean(s.jsonMode),
    reasoning: Boolean(s.reasoning),
    maxSteps: Math.round(num(s.maxSteps, DEFAULT_SETTINGS.maxSteps, SETTINGS_LIMITS.maxSteps)),
    actionDelayMs: Math.round(num(s.actionDelayMs, DEFAULT_SETTINGS.actionDelayMs, SETTINGS_LIMITS.actionDelayMs)),
    settleTimeoutMs: Math.round(num(s.settleTimeoutMs, DEFAULT_SETTINGS.settleTimeoutMs, SETTINGS_LIMITS.settleTimeoutMs)),
    requestTimeoutMs: Math.round(num(s.requestTimeoutMs, DEFAULT_SETTINGS.requestTimeoutMs, SETTINGS_LIMITS.requestTimeoutMs)),
    extraInstructions: String(s.extraInstructions ?? '').slice(0, 4000),
  };
}

export async function loadSettings(): Promise<AgentSettings> {
  const raw = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return sanitizeSettings(raw[STORAGE_KEYS.settings] as Partial<AgentSettings> | undefined);
}

export async function saveSettings(settings: AgentSettings): Promise<AgentSettings> {
  const clean = sanitizeSettings(settings);
  await chrome.storage.local.set({ [STORAGE_KEYS.settings]: clean });
  return clean;
}

/** Throws a user-friendly error when the BYOK configuration is incomplete. */
export function assertConfigured(settings: AgentSettings): void {
  if (!settings.apiKey && !/localhost|127\.0\.0\.1/.test(settings.baseUrl)) {
    throw new Error('Configure sua API Key na aba Configurações antes de iniciar.');
  }
  if (!/^https?:\/\//i.test(settings.baseUrl)) throw new Error('Base URL inválida (deve começar com http:// ou https://).');
  if (!settings.model) throw new Error('Informe o Model ID nas Configurações.');
}

export async function loadSession(): Promise<SessionState | null> {
  const raw = await chrome.storage.local.get(STORAGE_KEYS.session);
  const value = raw[STORAGE_KEYS.session] as SessionState | undefined;
  return value && Array.isArray(value.logs) ? value : null;
}

export async function saveSession(state: SessionState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.session]: state });
}
