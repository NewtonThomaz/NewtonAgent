import { MAX_ACTIONS_PER_STEP } from '../shared/constants';
import type { ActionResult, AgentAction, AgentDecision, AgentSettings, PageSnapshot } from '../shared/types';
import { cleanText, errorMessage, quickHash, sleep } from '../shared/utils';
import { startKeepAlive, stopKeepAlive } from './keepalive';
import { LLMClient } from './llm/client';
import { buildMessages, type HistoryItem } from './prompt';
import type { SessionStore } from './session';
import { detectNavigation, ensureContentScript, getTab, sendToTab, waitForTabComplete } from './tab-bridge';

export class AgentRunner {
  private abortController: AbortController | null = null;
  private pausePromiseResolve: (() => void) | null = null;
  private isPaused = false;
  private readonly llm = new LLMClient();

  constructor(private readonly session: SessionStore) {}

  get isRunning(): boolean {
    return this.abortController !== null && !this.abortController.signal.aborted;
  }

  async start(goal: string, tabId: number, settings: AgentSettings, maxSteps = settings.maxSteps): Promise<void> {
    if (this.isRunning) {
      throw new Error('Já existe uma missão em andamento.');
    }

    this.abortController = new AbortController();
    this.isPaused = false;
    this.pausePromiseResolve = null;

    this.session.beginMission(goal, tabId, maxSteps);
    this.session.log('user', goal);
    this.session.log('system', `Iniciando agente NewtonAgent na aba #${tabId} (limite: ${maxSteps} passos)...`);

    startKeepAlive();

    try {
      await this.runLoop(goal, tabId, settings, maxSteps, this.abortController.signal);
    } catch (err) {
      if (this.abortController?.signal.aborted) {
        this.session.log('system', 'Missão interrompida pelo usuário.');
        this.session.setStatus('stopped');
      } else {
        const msg = errorMessage(err);
        this.session.log('error', `Erro na execução: ${msg}`);
        this.session.setStatus('error');
      }
    } finally {
      stopKeepAlive();
      this.abortController = null;
      this.isPaused = false;
      this.pausePromiseResolve = null;
      // Clear visual overlay in tab
      void sendToTab(tabId, { type: 'CS/CLEAR_OVERLAY' }, 2000).catch(() => {});
    }
  }

  pause(): void {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    this.session.setStatus('paused');
    this.session.log('system', 'Missão pausada.');
  }

  resume(): void {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    this.session.setStatus('running');
    this.session.log('system', 'Missão retomada.');
    if (this.pausePromiseResolve) {
      this.pausePromiseResolve();
      this.pausePromiseResolve = null;
    }
  }

  stop(): void {
    if (!this.isRunning) return;
    this.session.setStatus('stopping');
    if (this.pausePromiseResolve) {
      this.pausePromiseResolve();
      this.pausePromiseResolve = null;
    }
    this.abortController?.abort();
  }

  private async waitIfPaused(signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new Error('Interrompido');
    if (!this.isPaused) return;

    await new Promise<void>((resolve, reject) => {
      this.pausePromiseResolve = resolve;
      signal.addEventListener('abort', () => reject(new Error('Interrompido')), { once: true });
    });
  }

  private async runLoop(
    goal: string,
    tabId: number,
    settings: AgentSettings,
    maxSteps: number,
    signal: AbortSignal,
  ): Promise<void> {
    const history: HistoryItem[] = [];
    let lastPageHash = '';
    let sameHashCount = 0;

    for (let step = 1; step <= maxSteps; step++) {
      await this.waitIfPaused(signal);
      if (signal.aborted) throw new Error('Interrompido');

      this.session.setStep(step);

      // 1. Garantir que o content script está vivo
      await ensureContentScript(tabId);

      // 2. OBSERVE — Capturar snapshot do DOM
      const snapshot: PageSnapshot = await sendToTab(tabId, { type: 'CS/SNAPSHOT' }, 15_000);
      const currentHash = quickHash(snapshot.nodes.map((n) => (n.kind === 'element' ? `${n.id}:${n.name}` : n.text)).join('|'));

      if (currentHash === lastPageHash) {
        sameHashCount++;
      } else {
        sameHashCount = 0;
        lastPageHash = currentHash;
      }

      this.session.log(
        'observe',
        `Passo ${step}/${maxSteps} · Página: "${cleanText(snapshot.title, 40)}" (${snapshot.interactiveCount} elementos)`,
        { step },
      );

      // 3. THINK — Consultar o LLM
      const messages = buildMessages(goal, snapshot, history, settings);
      if (sameHashCount >= 2) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg) {
          lastMsg.content += `\n[AVISO CRÍTICO]: A página NÃO mudou nos últimos ${sameHashCount} passos. Verifique se a ação anterior falhou ou se é necessário rolar a tela ou tentar outro elemento.`;
        }
      }

      const decision: AgentDecision = await this.llm.getDecision(settings, messages, signal);

      this.session.log('thought', decision.thought, { step });

      // Verificar se a meta foi alcançada
      if (decision.goal_achieved) {
        const answer = decision.final_answer || 'Meta concluída com sucesso!';
        this.session.log('success', answer, { step, ok: true });
        this.session.setStatus('completed');
        return;
      }

      // 4. ACT — Executar as ações propostas
      const actionSummaries: string[] = [];
      const resultSummaries: string[] = [];
      const actionsToRun = decision.actions.slice(0, MAX_ACTIONS_PER_STEP);

      for (let i = 0; i < actionsToRun.length; i++) {
        await this.waitIfPaused(signal);
        if (signal.aborted) throw new Error('Interrompido');

        const action = actionsToRun[i]!;
        const actionLabel = this.formatActionLabel(action);
        actionSummaries.push(actionLabel);

        this.session.log('action', `[${i + 1}/${actionsToRun.length}] ${actionLabel}`, { step });

        const tabBefore = await getTab(tabId);
        let result: ActionResult;

        if (action.type === 'navigate') {
          await chrome.tabs.update(tabId, { url: action.url });
          await waitForTabComplete(tabId, 25_000);
          result = { ok: true, message: `Navegou para ${action.url}`, navigated: true };
        } else {
          result = await sendToTab(tabId, { type: 'CS/EXECUTE', action, label: actionLabel }, 20_000);
        }

        resultSummaries.push(result.message);
        this.session.log('result', result.message, { step, ok: result.ok });

        // Verificar se a ação causou navegação de página
        const didNavigate = result.navigated || (await detectNavigation(tabId, tabBefore.url));
        if (didNavigate) {
          this.session.log('system', 'Detectada mudança de página / navegação. Aguardando carregamento...');
          await waitForTabComplete(tabId, 25_000);
          await sleep(500);
          // Interrompe as ações restantes deste passo porque os data-ai-id são da página anterior
          break;
        }

        if (settings.actionDelayMs > 0 && i < actionsToRun.length - 1) {
          await sleep(settings.actionDelayMs);
        }
      }

      // 5. Esperar estabilização do DOM/rede
      try {
        await sendToTab(tabId, { type: 'CS/WAIT_STABLE', timeoutMs: settings.settleTimeoutMs, quietMs: 400 }, settings.settleTimeoutMs + 3000);
      } catch {
        // Ignora timeout da estabilização
      }

      // Salvar histórico do passo
      history.push({
        step,
        thought: decision.thought,
        actionSummary: actionSummaries.join('; ') || 'Nenhuma ação executada',
        resultSummary: resultSummaries.join('; ') || 'OK',
        url: snapshot.url,
      });

      if (step === maxSteps) {
        this.session.log('system', `Atingido o número máximo estipulado de passos (${maxSteps}).`);
        this.session.setStatus('completed');
      }
    }
  }

  private formatActionLabel(action: AgentAction): string {
    switch (action.type) {
      case 'click':
        return `Clicar em [${action.targetId}]`;
      case 'type':
        return `Digitar "${cleanText(action.value, 30)}" em [${action.targetId}]`;
      case 'select':
        return `Selecionar "${cleanText(action.value, 30)}" em [${action.targetId}]`;
      case 'check':
        return `${action.checked ? 'Marcar' : 'Desmarcar'} [${action.targetId}]`;
      case 'hover':
        return `Passar o mouse sobre [${action.targetId}]`;
      case 'press_key':
        return `Pressionar tecla "${action.key}"${action.targetId ? ` em [${action.targetId}]` : ''}`;
      case 'scroll':
        return `Rolar página para ${action.direction === 'down' ? 'baixo' : 'cima'}`;
      case 'wait':
        return `Aguardar ${action.ms}ms`;
      case 'navigate':
        return `Navegar para ${action.url}`;
      default:
        return 'Ação desconhecida';
    }
  }
}
