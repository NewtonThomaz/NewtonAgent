import { MAX_LOG_ENTRIES, createInitialSession } from '../shared/constants';
import type { BackgroundEvent } from '../shared/messages';
import type { AgentStatus, ChatLogEntry, LogKind, SessionState } from '../shared/types';
import { uid } from '../shared/utils';
import { loadSession, saveSession } from './storage';

const ACTIVE: ReadonlySet<AgentStatus> = new Set(['running', 'paused', 'stopping']);

/**
 * Single source of truth for the agent session. Every mutation is:
 *  1. applied in memory,
 *  2. streamed to every connected Side Panel through its Port,
 *  3. persisted (debounced) to chrome.storage.local — survives panel close and worker restarts.
 */
export class SessionStore {
  private state: SessionState = createInitialSession();
  private readonly ports = new Set<chrome.runtime.Port>();
  private persistTimer: ReturnType<typeof setTimeout> | undefined;

  async hydrate(): Promise<void> {
    const saved = await loadSession();
    if (!saved) return;
    this.state = { ...createInitialSession(), ...saved };
    if (ACTIVE.has(this.state.status)) {
      // The worker was terminated mid-mission: in-memory runner is gone, reflect it honestly.
      this.state.status = 'stopped';
      this.state.finishedAt = Date.now();
      this.log('system', 'A missão anterior foi interrompida porque o service worker foi reiniciado pelo navegador.');
    }
  }

  get snapshot(): SessionState {
    return this.state;
  }

  get isActive(): boolean {
    return ACTIVE.has(this.state.status);
  }

  attach(port: chrome.runtime.Port): void {
    this.ports.add(port);
    port.onDisconnect.addListener(() => this.ports.delete(port));
    this.post(port, { type: 'BG/STATE', state: this.state });
  }

  log(kind: LogKind, text: string, extra: { step?: number; ok?: boolean } = {}): ChatLogEntry {
    const entry: ChatLogEntry = { id: uid('log'), kind, text, timestamp: Date.now(), ...extra };
    this.state.logs.push(entry);
    if (this.state.logs.length > MAX_LOG_ENTRIES) this.state.logs.splice(0, this.state.logs.length - MAX_LOG_ENTRIES);
    this.broadcast({ type: 'BG/LOG', entry });
    this.schedulePersist();
    return entry;
  }

  setStatus(status: AgentStatus): void {
    this.state.status = status;
    if (!ACTIVE.has(status) && status !== 'idle') this.state.finishedAt = Date.now();
    this.broadcastStatus();
    this.schedulePersist();
  }

  setStep(step: number): void {
    this.state.step = step;
    this.broadcastStatus();
    this.schedulePersist();
  }

  beginMission(goal: string, tabId: number, maxSteps: number): void {
    Object.assign(this.state, {
      status: 'running' satisfies AgentStatus,
      goal,
      tabId,
      step: 0,
      maxSteps,
      startedAt: Date.now(),
      finishedAt: null,
    });
    this.broadcastStatus();
    this.schedulePersist(true);
  }

  clear(): SessionState {
    this.state = createInitialSession();
    this.broadcast({ type: 'BG/STATE', state: this.state });
    this.schedulePersist(true);
    return this.state;
  }

  private broadcastStatus(): void {
    this.broadcast({ type: 'BG/STATUS', status: this.state.status, step: this.state.step, maxSteps: this.state.maxSteps });
  }

  private broadcast(event: BackgroundEvent): void {
    for (const port of this.ports) this.post(port, event);
  }

  private post(port: chrome.runtime.Port, event: BackgroundEvent): void {
    try {
      port.postMessage(event);
    } catch {
      this.ports.delete(port);
    }
  }

  private schedulePersist(immediate = false): void {
    clearTimeout(this.persistTimer);
    const run = () => void saveSession(this.state).catch((e) => console.warn('[NewtonAgent] persist failed', e));
    if (immediate) run();
    else this.persistTimer = setTimeout(run, 400);
  }
}
