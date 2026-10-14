import type { AgentSettings, DistilledElement, PageSnapshot } from '../shared/types';
import type { ChatMessage } from './llm/openai';

export interface HistoryItem {
  step: number;
  thought: string;
  actionSummary: string;
  resultSummary: string;
  url: string;
}

/**
 * Builds the compact serialized string from a distilled DOM snapshot.
 * Saves ~60-70% tokens compared to raw JSON.
 */
export function serializeSnapshot(snapshot: PageSnapshot): string {
  const lines: string[] = [
    `=== PÁGINA ATUAL ===`,
    `URL: ${snapshot.url}`,
    `Título: ${snapshot.title || '(sem título)'}`,
    `Rolagem: ${snapshot.scroll.y}px de ${snapshot.scroll.height}px (viewport: ${snapshot.scroll.viewport}px)`,
    `Elementos interativos identificados: ${snapshot.interactiveCount}`,
    snapshot.truncated ? `[AVISO: Árvore truncada devido ao limite de nós. Foque nos elementos visíveis]` : '',
    `--- CONTEÚDO VISÍVEL DA PÁGINA ---`,
  ];

  for (const node of snapshot.nodes) {
    if (node.kind === 'text') {
      lines.push(`Texto (${node.tag}): ${node.text}`);
    } else {
      lines.push(serializeElement(node));
    }
  }

  return lines.filter(Boolean).join('\n');
}

function serializeElement(el: DistilledElement): string {
  const parts: string[] = [`[${el.id}]`, el.role];

  if (el.name) {
    parts.push(`"${el.name}"`);
  }

  if (el.inputType && el.inputType !== 'text') {
    parts.push(`type=${el.inputType}`);
  }

  if (el.group) {
    parts.push(`group=${el.group}`);
  }

  if (el.checked !== undefined) {
    parts.push(el.checked ? '[MARCADO]' : '[DESMARCADO]');
  }

  if (el.selected !== undefined) {
    parts.push(el.selected ? '[SELECIONADO]' : '[NÃO-SELECIONADO]');
  }

  if (el.value !== undefined && el.value !== '') {
    parts.push(`valor="${el.value}"`);
  }

  if (el.placeholder) {
    parts.push(`placeholder="${el.placeholder}"`);
  }

  if (el.disabled) {
    parts.push(`(desabilitado)`);
  }

  if (el.required) {
    parts.push(`(obrigatório)`);
  }

  if (el.expanded !== undefined) {
    parts.push(el.expanded ? `(expandido)` : `(recolhido)`);
  }

  if (el.options && el.options.length > 0) {
    const opts = el.options
      .map((o) => `${o.selected ? '*' : ''}"${o.text}"${o.value ? `=${o.value}` : ''}`)
      .join(', ');
    parts.push(`opções=[${opts}]`);
  }

  if (!el.inViewport) {
    parts.push(`(fora da tela)`);
  }

  return parts.join(' ');
}

export const SYSTEM_PROMPT = `Você é o NewtonAgent, um agente autônomo sênior de automação e testes web integrado diretamente ao navegador.
Seu objetivo principal é interagir com a página ativa (formulários dinâmicos, PWAs, questionários, portais) para cumprir a meta definida pelo usuário com precisão cirúrgica.

### REGRAS FUNDAMENTAIS DE OPERAÇÃO:
1. Você recebe a representação destilada dos elementos visíveis e interativos do DOM.
2. Cada elemento interativo possui um identificador numérico único no formato [id]. Use EXCLUSIVAMENTE esses IDs nas ações.
3. Se um elemento estiver fora da tela ou a pergunta seguinte não estiver visível, use a ação "scroll" ("down") para revelá-la.
4. Para formulários e questionários:
   - Leia atentamente as perguntas (Texto) e selecione a alternativa correta usando "click" ou "check" no [id] correspondente.
   - Preencha campos de texto usando "type" com o [id] e o valor.
   - Selecione opções de <select> usando "select" ou clicando na opção desejada.
   - Após preencher uma seção ou questão, clique no botão "Próximo", "Avançar", "Submeter" ou similar se o fluxo exigir.
5. Quando o objetivo do usuário estiver totalmente alcançado (ex: todas as perguntas respondidas, formulário submetido ou etapa final atingida), retorne "goal_achieved": true.
6. O navegador já aguarda estabilização de rede e DOM automaticamente. NÃO adicione "wait" longo após cliques comuns. Use "wait" (ms: 800 a 1500) apenas se a página exibir um indicador visual de carregamento ou transição em andamento.

### FORMATO ESTRITO DE RESPOSTA (JSON APENAS):
Sua resposta DEVE ser estritamente um JSON no seguinte formato (sem explicações fora do JSON):
{
  "thought": "Breve raciocínio explicando o que você identificou na página e qual ação está tomando agora.",
  "goal_achieved": false,
  "actions": [
    { "type": "click", "targetId": 12 },
    { "type": "type", "targetId": 15, "value": "Texto a ser preenchido", "clear": true, "pressEnter": false },
    { "type": "select", "targetId": 18, "value": "Valor da opção" },
    { "type": "check", "targetId": 21, "checked": true },
    { "type": "press_key", "key": "Enter", "targetId": 15 },
    { "type": "scroll", "direction": "down", "amount": 600 },
    { "type": "wait", "ms": 1000 },
    { "type": "navigate", "url": "https://..." }
  ],
  "final_answer": "Mensagem final opcional de encerramento para o usuário quando goal_achieved for true."
}

TIPOS DE AÇÃO SUPORTADOS:
- click: { "type": "click", "targetId": number }
- type: { "type": "type", "targetId": number, "value": string, "clear"?: boolean, "pressEnter"?: boolean }
- select: { "type": "select", "targetId": number, "value": string }
- check: { "type": "check", "targetId": number, "checked": boolean }
- hover: { "type": "hover", "targetId": number }
- press_key: { "type": "press_key", "key": string, "targetId"?: number }
- scroll: { "type": "scroll", "direction": "up" | "down", "amount"?: number, "targetId"?: number }
- wait: { "type": "wait", "ms": number }
- navigate: { "type": "navigate", "url": string }
`;

export function buildMessages(
  goal: string,
  snapshot: PageSnapshot,
  history: HistoryItem[],
  settings: AgentSettings,
): ChatMessage[] {
  let systemContent = SYSTEM_PROMPT;
  if (settings.extraInstructions.trim()) {
    systemContent += `\n\n### INSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${settings.extraInstructions.trim()}`;
  }

  const userLines: string[] = [
    `### META DO USUÁRIO:`,
    goal,
    ``,
  ];

  if (history.length > 0) {
    userLines.push(`### HISTÓRICO DE AÇÕES ANTERIORES:`);
    for (const h of history.slice(-8)) {
      userLines.push(`Passo ${h.step}: ${h.thought}`);
      userLines.push(`  → Ação: ${h.actionSummary} | Resultado: ${h.resultSummary}`);
    }
    userLines.push(``);
  }

  userLines.push(serializeSnapshot(snapshot));
  userLines.push(``);
  userLines.push(`Agora, com base no estado atual da página, retorne o JSON com seu "thought" e a lista de "actions".`);

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userLines.join('\n') },
  ];
}
