import type { AgentSettings } from '../../shared/types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Sends a chat completion request to any OpenAI-compatible API endpoint
 * (OpenAI, NVIDIA NIM, OpenRouter, Ollama, etc.).
 */
export async function sendOpenAIRequest(
  settings: AgentSettings,
  messages: ChatMessage[],
  signal: AbortSignal,
): Promise<string> {
  let url = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (settings.apiKey) {
    headers['Authorization'] = `Bearer ${settings.apiKey.trim()}`;
  }

  // Nemotron / specialized model handling
  const isNemotron = /nemotron/i.test(settings.model);
  const effectiveMessages = [...messages];

  if (isNemotron) {
    // If reasoning toggle is off or on, Nemotron expects instruction tuning or specific tags
    if (settings.reasoning) {
      // Nemotron-ultra specific reasoning hint if desired
      const firstSys = effectiveMessages.find((m) => m.role === 'system');
      if (firstSys) {
        firstSys.content = `detailed thinking on\n${firstSys.content}`;
      }
    }
  }

  const basePayload: Record<string, unknown> = {
    model: settings.model,
    messages: effectiveMessages,
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
  };

  // If jsonMode is requested, try with response_format first
  if (settings.jsonMode) {
    basePayload['response_format'] = { type: 'json_object' };
  }

  const executeFetch = async (payload: Record<string, unknown>): Promise<Response> => {
    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });
  };

  let response: Response;
  try {
    response = await executeFetch(basePayload);
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new Error(`Falha de rede ao conectar com a API: ${(err as Error).message}`);
  }

  // Fallback: If 400 Bad Request mentions response_format or json_object not supported, retry without it
  if (response.status === 400 && settings.jsonMode) {
    const errorBody = await response.text().catch(() => '');
    if (/response_format|json_object|json mode/i.test(errorBody)) {
      const fallbackPayload = { ...basePayload };
      delete fallbackPayload['response_format'];
      response = await executeFetch(fallbackPayload);
    } else {
      throw new Error(`Erro na API (${response.status}): ${errorBody || response.statusText}`);
    }
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Erro da API (${response.status} ${response.statusText}): ${errText || 'Sem detalhes'}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('A API retornou uma resposta sem conteúdo de mensagem.');
  }

  return content;
}
