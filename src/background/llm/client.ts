import type { AgentDecision, AgentSettings } from '../../shared/types';
import { sendGeminiRequest } from './gemini';
import { sendOpenAIRequest, type ChatMessage } from './openai';
import { parseDecision } from './parse';

export class LLMClient {
  /**
   * Completes a single turn with the configured LLM and returns the parsed AgentDecision.
   */
  async getDecision(
    settings: AgentSettings,
    messages: ChatMessage[],
    parentSignal?: AbortSignal,
  ): Promise<AgentDecision> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort(new Error(`Timeout de requisição (${Math.round(settings.requestTimeoutMs / 1000)}s) excedido.`));
    }, settings.requestTimeoutMs);

    if (parentSignal) {
      parentSignal.addEventListener('abort', () => controller.abort(parentSignal.reason), { once: true });
    }

    try {
      let rawText: string;
      if (settings.provider === 'gemini') {
        rawText = await sendGeminiRequest(settings, messages, controller.signal);
      } else {
        rawText = await sendOpenAIRequest(settings, messages, controller.signal);
      }

      return parseDecision(rawText);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Performs a lightweight test call to verify that the credentials and model work.
   */
  async testConnection(settings: AgentSettings): Promise<{ latencyMs: number; sample: string }> {
    const start = performance.now();
    const testMessages: ChatMessage[] = [
      {
        role: 'system',
        content: 'Você é um assistente de teste de conexão. Responda estritamente com o JSON: {"status": "ok"}',
      },
      {
        role: 'user',
        content: 'ping',
      },
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Timeout de teste (15s)')), 15_000);

    try {
      let text: string;
      if (settings.provider === 'gemini') {
        text = await sendGeminiRequest(settings, testMessages, controller.signal);
      } else {
        text = await sendOpenAIRequest(settings, testMessages, controller.signal);
      }
      const latencyMs = Math.round(performance.now() - start);
      return { latencyMs, sample: text.trim().slice(0, 100) };
    } finally {
      clearTimeout(timer);
    }
  }
}
