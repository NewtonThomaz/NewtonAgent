import type { ActionResult, AgentAction } from '../shared/types';
import { clamp, cleanText, randomBetween, sleep } from '../shared/utils';
import { resolveTarget, type RegistryEntry } from './distiller';
import { findMainScrollable, isNativeCheckable, isVisible, scrollableAncestor } from './dom-utils';
import { highlight } from './overlay';

/* ───────────────────────────── helpers ───────────────────────────── */

class ActionError extends Error {
  constructor(
    message: string,
    readonly code: ActionResult['code'] = 'error',
  ) {
    super(message);
  }
}

function getTarget(targetId: number): RegistryEntry {
  const entry = resolveTarget(targetId);
  if (!entry) {
    throw new ActionError(`Elemento [${targetId}] não existe mais (a página mudou). Observe novamente.`, 'stale');
  }
  return entry;
}

const isTextField = (el: Element): el is HTMLInputElement | HTMLTextAreaElement =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement &&
    !['checkbox', 'radio', 'submit', 'button', 'reset', 'image', 'file', 'range', 'color'].includes(el.type));

/** Input types whose value must be committed atomically (partial values are invalid). */
const ATOMIC_INPUT_TYPES = new Set(['date', 'datetime-local', 'month', 'week', 'time', 'number', 'range', 'color']);

/**
 * Sets `value` through the *prototype* setter. Frameworks like React install an instance-level
 * value tracker; calling the native prototype setter guarantees the subsequent `input` event is
 * seen as a real change and `onChange` fires. (In the ISOLATED world the main-world tracker is
 * already invisible, but this keeps the behaviour explicit and robust.)
 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function centerOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
}

function mouseInit(x: number, y: number, extra: MouseEventInit = {}): MouseEventInit {
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    view: window,
    clientX: x,
    clientY: y,
    screenX: x + window.screenX,
    screenY: y + window.screenY,
    button: 0,
    ...extra,
  };
}

function pointerInit(x: number, y: number, extra: PointerEventInit = {}): PointerEventInit {
  return {
    ...mouseInit(x, y),
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    width: 1,
    height: 1,
    pressure: 0,
    ...extra,
  };
}

async function revealElement(el: Element): Promise<void> {
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
  await sleep(60);
}

/** Picks the deepest node at the element's center if it belongs to the target (real hit-testing). */
function hitTarget(el: HTMLElement, x: number, y: number): { target: HTMLElement; covered: boolean } {
  const root = el.getRootNode() as Document | ShadowRoot;
  const atPoint = (root.elementFromPoint?.(x, y) ?? document.elementFromPoint(x, y)) as HTMLElement | null;
  if (atPoint && (atPoint === el || el.contains(atPoint))) return { target: atPoint, covered: false };
  return { target: el, covered: !!atPoint && !atPoint.contains(el) };
}

function hoverSequence(target: HTMLElement, x: number, y: number): void {
  target.dispatchEvent(new PointerEvent('pointerover', pointerInit(x, y)));
  target.dispatchEvent(new PointerEvent('pointerenter', pointerInit(x, y, { bubbles: false })));
  target.dispatchEvent(new MouseEvent('mouseover', mouseInit(x, y)));
  target.dispatchEvent(new MouseEvent('mouseenter', mouseInit(x, y, { bubbles: false })));
  target.dispatchEvent(new PointerEvent('pointermove', pointerInit(x, y)));
  target.dispatchEvent(new MouseEvent('mousemove', mouseInit(x, y)));
}

/**
 * Full human-like click chain:
 * pointerover → pointerenter → mouseover → mousemove → pointerdown → mousedown → focus →
 * pointerup → mouseup → click. A synthetic `click` triggers native activation behaviour
 * (checkbox toggle, label → control forwarding, submit buttons, anchors).
 */
export async function realisticClick(el: HTMLElement, focusEl: HTMLElement = el): Promise<{ covered: boolean }> {
  await revealElement(el);
  const { x, y } = centerOf(el);
  const { target, covered } = hitTarget(el, x, y);

  hoverSequence(target, x, y);
  target.dispatchEvent(new PointerEvent('pointerdown', pointerInit(x, y, { buttons: 1, pressure: 0.5 })));
  const notPrevented = target.dispatchEvent(new MouseEvent('mousedown', mouseInit(x, y, { buttons: 1, detail: 1 })));
  if (notPrevented) focusEl.focus({ preventScroll: true });
  await sleep(randomBetween(35, 85));
  target.dispatchEvent(new PointerEvent('pointerup', pointerInit(x, y, { buttons: 0 })));
  target.dispatchEvent(new MouseEvent('mouseup', mouseInit(x, y, { buttons: 0, detail: 1 })));
  target.dispatchEvent(new MouseEvent('click', mouseInit(x, y, { buttons: 0, detail: 1 })));
  return { covered };
}

const KEY_CODES: Record<string, number> = {
  Enter: 13,
  Tab: 9,
  Escape: 27,
  Backspace: 8,
  Delete: 46,
  ' ': 32,
  Space: 32,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Home: 36,
  End: 35,
  PageUp: 33,
  PageDown: 34,
};

function keyInit(key: string): KeyboardEventInit {
  const normalized = key === 'Space' ? ' ' : key;
  let code = normalized;
  let keyCode = KEY_CODES[key] ?? 0;
  if (normalized.length === 1) {
    const upper = normalized.toUpperCase();
    if (/[A-Z]/.test(upper)) code = `Key${upper}`;
    else if (/[0-9]/.test(normalized)) code = `Digit${normalized}`;
    else if (normalized === ' ') code = 'Space';
    else code = '';
    keyCode = keyCode || upper.charCodeAt(0);
  }
  return { key: normalized, code, keyCode, which: keyCode, bubbles: true, cancelable: true, composed: true };
}

function focusableElements(): HTMLElement[] {
  const selector =
    'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((el) => isVisible(el));
}

/* ───────────────────────────── primitive actions ───────────────────────────── */

async function pressKey(key: string, explicitTarget?: HTMLElement): Promise<string> {
  const target = explicitTarget ?? (document.activeElement as HTMLElement | null) ?? document.body;
  if (explicitTarget) explicitTarget.focus({ preventScroll: false });
  const init = keyInit(key);
  const notPrevented = target.dispatchEvent(new KeyboardEvent('keydown', init));
  if (init.key === 'Enter' || (init.key?.length ?? 0) === 1) {
    target.dispatchEvent(new KeyboardEvent('keypress', { ...init, charCode: init.keyCode }));
  }
  target.dispatchEvent(new KeyboardEvent('keyup', init));
  if (!notPrevented) return `Tecla ${key} enviada (tratada pela página)`;

  // Synthetic key events have no default action — emulate the browser's default behaviour.
  if (init.key === 'Enter') {
    if (target instanceof HTMLInputElement && target.form) {
      target.form.requestSubmit();
      return 'Enter → formulário submetido';
    }
    if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement || target.getAttribute('role') === 'button') {
      target.click();
      return 'Enter → elemento ativado';
    }
  } else if (init.key === ' ' && (isNativeCheckable(target) || target instanceof HTMLButtonElement)) {
    target.click();
    return 'Espaço → elemento ativado';
  } else if (init.key === 'Tab') {
    const list = focusableElements();
    const idx = list.indexOf(target);
    const next = list[(idx + 1) % Math.max(1, list.length)];
    next?.focus();
    return 'Tab → foco avançou';
  }
  return `Tecla ${key} enviada`;
}

async function typeText(entry: RegistryEntry, value: string, clear: boolean, pressEnter: boolean): Promise<string> {
  const el = entry.el;
  if (el.getAttribute('aria-disabled') === 'true' || (el as HTMLInputElement).disabled) {
    throw new ActionError('Campo desabilitado.', 'invalid');
  }
  await realisticClick(entry.proxy ?? el, el);
  el.focus({ preventScroll: true });

  if (el.isContentEditable) {
    if (clear) {
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
    }
    const inserted = document.execCommand('insertText', false, value);
    if (!inserted) {
      el.textContent = (clear ? '' : el.textContent ?? '') + value;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
    }
  } else if (isTextField(el)) {
    if (clear && el.value) {
      setNativeValue(el, '');
      el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'deleteContentBackward' }));
    }
    const atomic = el instanceof HTMLInputElement && ATOMIC_INPUT_TYPES.has(el.type);
    const chars = Array.from(value);
    if (!atomic && chars.length <= 160) {
      // Character-by-character typing: maximum compatibility with masks/autocomplete/validators.
      for (const ch of chars) {
        const init = keyInit(ch);
        el.dispatchEvent(new KeyboardEvent('keydown', init));
        el.dispatchEvent(new KeyboardEvent('keypress', { ...init, charCode: ch.charCodeAt(0) }));
        const proceed = el.dispatchEvent(
          new InputEvent('beforeinput', { bubbles: true, cancelable: true, composed: true, inputType: 'insertText', data: ch }),
        );
        if (proceed) {
          setNativeValue(el, el.value + ch);
          el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: ch }));
        }
        el.dispatchEvent(new KeyboardEvent('keyup', init));
        await sleep(randomBetween(6, 24));
      }
    } else {
      setNativeValue(el, (clear ? '' : el.value) + value);
      el.dispatchEvent(
        new InputEvent('input', { bubbles: true, composed: true, inputType: atomic ? 'insertReplacementText' : 'insertFromPaste', data: value }),
      );
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    throw new ActionError(`Elemento <${el.localName}> não é um campo de texto. Use "click" ou "select".`, 'invalid');
  }

  let message = `Digitado "${cleanText(value, 60)}"`;
  if (isTextField(el) && !el.value.includes(value) && el.type !== 'password') {
    message += ` (o campo exibe "${cleanText(el.value, 60)}" — possível máscara/validação)`;
  }
  if (pressEnter) message += ` · ${await pressKey('Enter', el)}`;
  return message;
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function selectOption(entry: RegistryEntry, value: string): Promise<string> {
  const el = entry.el;
  if (!(el instanceof HTMLSelectElement)) {
    await realisticClick(entry.proxy ?? el, el);
    return 'Componente de seleção customizado aberto — escolha a opção no próximo passo.';
  }
  await revealElement(el);
  const wanted = normalize(value);
  const options = Array.from(el.options);
  const option =
    options.find((o) => normalize(o.value) === wanted) ??
    options.find((o) => normalize(o.text) === wanted) ??
    options.find((o) => normalize(o.text).includes(wanted)) ??
    options.find((o) => wanted.includes(normalize(o.text)) && normalize(o.text).length > 0);
  if (!option) {
    const available = options.map((o) => o.text.trim()).slice(0, 15).join(' | ');
    throw new ActionError(`Opção "${value}" não encontrada. Disponíveis: ${available}`, 'invalid');
  }
  el.focus({ preventScroll: true });
  el.dispatchEvent(new PointerEvent('pointerdown', pointerInit(0, 0, { buttons: 1 })));
  el.dispatchEvent(new MouseEvent('mousedown', mouseInit(0, 0, { buttons: 1 })));
  setNativeValue(el, option.value);
  option.selected = true;
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseup', mouseInit(0, 0)));
  return `Selecionado "${cleanText(option.text, 60)}"`;
}

function readChecked(el: HTMLElement): boolean | null {
  if (isNativeCheckable(el)) return el.checked;
  const aria = el.getAttribute('aria-checked') ?? el.getAttribute('aria-pressed') ?? el.getAttribute('aria-selected');
  if (aria === 'true') return true;
  if (aria === 'false') return false;
  return null;
}

async function setChecked(entry: RegistryEntry, desired: boolean): Promise<string> {
  const el = entry.el;
  const current = readChecked(el);
  if (current === desired) return desired ? 'Já estava marcado' : 'Já estava desmarcado';
  await realisticClick(entry.proxy ?? el, el);
  await sleep(40);
  const after = readChecked(el);
  if (after !== null && after !== desired && isNativeCheckable(el)) {
    // Last resort for exotic wrappers that swallow the click.
    el.click();
  }
  const final = readChecked(el);
  if (final !== null && final !== desired) {
    throw new ActionError('O clique não alterou o estado do controle. Tente clicar no texto da opção.', 'error');
  }
  return desired ? 'Marcado' : 'Desmarcado';
}

async function scrollPage(direction: 'up' | 'down', amount?: number, targetId?: number): Promise<string> {
  const delta = (direction === 'down' ? 1 : -1) * clamp(amount ?? Math.round(window.innerHeight * 0.8), 50, 20_000);
  let container: Element | null = null;
  if (targetId !== undefined) {
    const { el } = getTarget(targetId);
    container = el.scrollHeight > el.clientHeight + 4 ? el : scrollableAncestor(el);
  }
  const doc = document.scrollingElement ?? document.documentElement;
  if (!container && doc.scrollHeight <= window.innerHeight + 10) container = findMainScrollable();

  if (container && container !== doc) {
    container.scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior });
    return `Rolado ${direction === 'down' ? '↓' : '↑'} contêiner (${Math.round(container.scrollTop)}/${container.scrollHeight})`;
  }
  window.scrollBy({ top: delta, behavior: 'instant' as ScrollBehavior });
  return `Rolado ${direction === 'down' ? '↓' : '↑'} (${Math.round(window.scrollY)}/${doc.scrollHeight})`;
}

/* ───────────────────────────── dispatcher ───────────────────────────── */

export async function executeAction(action: AgentAction, label?: string): Promise<ActionResult> {
  try {
    const caption = label ?? action.type;
    switch (action.type) {
      case 'click': {
        const entry = getTarget(action.targetId);
        const visual = entry.proxy ?? entry.el;
        highlight(visual, caption);
        const { covered } = await realisticClick(visual, entry.el);
        return { ok: true, message: covered ? 'Clicado (elemento parcialmente coberto por outro)' : 'Clicado' };
      }
      case 'type': {
        const entry = getTarget(action.targetId);
        highlight(entry.proxy ?? entry.el, caption);
        const message = await typeText(entry, String(action.value ?? ''), action.clear !== false, action.pressEnter === true);
        return { ok: true, message };
      }
      case 'select': {
        const entry = getTarget(action.targetId);
        highlight(entry.proxy ?? entry.el, caption);
        return { ok: true, message: await selectOption(entry, String(action.value ?? '')) };
      }
      case 'check': {
        const entry = getTarget(action.targetId);
        highlight(entry.proxy ?? entry.el, caption);
        return { ok: true, message: await setChecked(entry, action.checked !== false) };
      }
      case 'hover': {
        const entry = getTarget(action.targetId);
        const el = entry.proxy ?? entry.el;
        await revealElement(el);
        highlight(el, caption);
        const { x, y } = centerOf(el);
        hoverSequence(el, x, y);
        return { ok: true, message: 'Mouse posicionado sobre o elemento' };
      }
      case 'press_key': {
        const target = action.targetId !== undefined ? getTarget(action.targetId).el : undefined;
        if (target) highlight(target, caption);
        return { ok: true, message: await pressKey(action.key, target) };
      }
      case 'scroll':
        return { ok: true, message: await scrollPage(action.direction, action.amount, action.targetId) };
      case 'wait': {
        const ms = clamp(Number(action.ms) || 1000, 0, 10_000);
        await sleep(ms);
        return { ok: true, message: `Aguardou ${ms}ms` };
      }
      case 'navigate':
        return { ok: false, code: 'invalid', message: 'navigate deve ser executado pelo background.' };
      default: {
        const unknownType = (action as { type: string }).type;
        return { ok: false, code: 'invalid', message: `Ação desconhecida: ${unknownType}` };
      }
    }
  } catch (err) {
    if (err instanceof ActionError) return { ok: false, code: err.code, message: err.message };
    return { ok: false, code: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
