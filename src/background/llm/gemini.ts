import type { AgentSettings } from '../../shared/types';
import type { ChatMessage } from './openai';

/**
 * Sends a native request to Google Generative Language API (Gemini).
 */
export async function sendGeminiRequest(
  settings: AgentSettings,
  messages: ChatMessage[],
  signal: AbortSignal,
): Promise<string> {
  const modelName = settings.model.replace(/^models\//, '');
  const baseUrl = settings.baseUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/models/${modelName}:generateContent?key=${encodeURIComponent(settings.apiKey.trim())}`;

  // Separate system instruction from conversational turns
  const systemMessage = messages.find((m) => m.role === 'system');
  const turns = messages.filter((m) => m.role !== 'system');

  const contents = turns.map((t) => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: t.content }],
  }));

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: settings.temperature,
      maxOutputTokens: settings.maxTokens,
    },
  };

  if (systemMessage) {
    payload['systemInstruction'] = {
      parts: [{ text: systemMessage.content }],
    };
  }

  if (settings.jsonMode) {
    (payload['generationConfig'] as Record<string, unknown>)['responseMimeType'] = 'application/json';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Erro Gemini (${response.status} ${response.statusText}): ${errText || 'Sem detalhes'}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('A API do Gemini retornou uma resposta vazia.');
  }

  return text;
}
