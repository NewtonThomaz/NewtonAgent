import { ACTION_TYPES, type ActionType, type AgentAction, type AgentDecision } from '../../shared/types';
import { cleanText } from '../../shared/utils';

/**
 * Strips <think>...</think> reasoning blocks (e.g. from Nemotron or DeepSeek models),
 * markdown code fences and extracts raw JSON.
 */
export function sanitizeModelOutput(text: string): { thinking: string; jsonCandidate: string } {
  let thinking = '';
  let content = text;

  // Extract <think>...</think> if present
  const thinkMatch = /<think>([\s\S]*?)<\/think>/i.exec(content);
  if (thinkMatch) {
    thinking = cleanText(thinkMatch[1] ?? '', 500);
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }

  // Strip markdown code fences like ```json ... ``` or ``` ... ```
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(content);
  if (fenceMatch && fenceMatch[1]) {
    content = fenceMatch[1].trim();
  }

  return { thinking, jsonCandidate: content };
}

/**
 * Finds the first balanced `{ ... }` block in a string.
 */
function extractFirstJsonObject(str: string): string | null {
  const start = str.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < str.length; i++) {
    const char = str[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === '\\') {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return str.slice(start, i + 1);
      }
    }
  }

  return null;
}

/**
 * Validates and normalizes an untrusted action from the LLM.
 */
function normalizeAction(raw: unknown): AgentAction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const type = String(item.type ?? '').toLowerCase() as ActionType;

  if (!ACTION_TYPES.includes(type)) return null;

  const targetId = typeof item.targetId === 'number' ? item.targetId : parseInt(String(item.targetId || ''), 10);

  switch (type) {
    case 'click':
      if (Number.isFinite(targetId)) return { type: 'click', targetId };
      return null;

    case 'type':
      if (Number.isFinite(targetId)) {
        return {
          type: 'type',
          targetId,
          value: String(item.value ?? ''),
          clear: item.clear !== false,
          pressEnter: Boolean(item.pressEnter),
        };
      }
      return null;

    case 'select':
      if (Number.isFinite(targetId)) {
        return {
          type: 'select',
          targetId,
          value: String(item.value ?? ''),
        };
      }
      return null;

    case 'check':
      if (Number.isFinite(targetId)) {
        return {
          type: 'check',
          targetId,
          checked: item.checked !== false,
        };
      }
      return null;

    case 'hover':
      if (Number.isFinite(targetId)) return { type: 'hover', targetId };
      return null;

    case 'press_key': {
      const key = String(item.key ?? 'Enter');
      return {
        type: 'press_key',
        key,
        ...(Number.isFinite(targetId) ? { targetId } : {}),
      };
    }

    case 'scroll': {
      const dir = item.direction === 'up' ? 'up' : 'down';
      const amount = typeof item.amount === 'number' ? item.amount : undefined;
      return {
        type: 'scroll',
        direction: dir,
        ...(Number.isFinite(targetId) ? { targetId } : {}),
        ...(amount !== undefined ? { amount } : {}),
      };
    }

    case 'wait': {
      const ms = typeof item.ms === 'number' ? item.ms : 1000;
      return { type: 'wait', ms };
    }

    case 'navigate': {
      const url = String(item.url ?? '');
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return { type: 'navigate', url };
      }
      return null;
    }

    default:
      return null;
  }
}

/**
 * Parses the raw LLM response text into a strictly validated AgentDecision.
 */
export function parseDecision(rawResponse: string): AgentDecision {
  const { thinking, jsonCandidate } = sanitizeModelOutput(rawResponse);

  const jsonStr = extractFirstJsonObject(jsonCandidate) ?? extractFirstJsonObject(rawResponse);
  if (!jsonStr) {
    throw new Error('A resposta do modelo não contém um objeto JSON válido.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(`JSON malformatado retornado pelo modelo: ${(err as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('A resposta do modelo deve ser um objeto JSON.');
  }

  const obj = parsed as Record<string, unknown>;

  const thought = String(obj.thought || thinking || 'Analisando a página...').trim();
  const goalAchieved = Boolean(obj.goal_achieved);
  const finalAnswer = typeof obj.final_answer === 'string' ? obj.final_answer.trim() : undefined;

  const rawActions = Array.isArray(obj.actions) ? obj.actions : [];
  const actions: AgentAction[] = [];

  for (const item of rawActions) {
    const norm = normalizeAction(item);
    if (norm) {
      actions.push(norm);
    }
  }

  if (!goalAchieved && actions.length === 0) {
    // If the model didn't achieve the goal and emitted 0 valid actions, provide a wait action or error
    if (!finalAnswer) {
      actions.push({ type: 'wait', ms: 1000 });
    }
  }

  return {
    thought,
    goal_achieved: goalAchieved,
    actions,
    final_answer: finalAnswer,
  };
}
