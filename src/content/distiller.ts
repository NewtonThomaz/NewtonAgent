import { MAX_SNAPSHOT_CHARS, MAX_SNAPSHOT_NODES } from '../shared/constants';
import type { DistilledElement, DistilledNode, DistilledOption, PageSnapshot } from '../shared/types';
import { cleanText, truncate } from '../shared/utils';
import {
  INTERACTIVE_SELECTOR,
  SKIP_TAGS,
  accessibleName,
  computeRole,
  directText,
  hasInteractiveDescendant,
  isInViewport,
  isNativeCheckable,
  isTextLeaf,
  isVisible,
  renderedChildren,
  visibleLabelFor,
} from './dom-utils';

export const AI_ID_ATTR = 'data-ai-id';

export interface RegistryEntry {
  /** The semantic element (e.g. the real <input type="radio">). */
  el: HTMLElement;
  /** Element a human would physically click when `el` is visually hidden (e.g. its <label>). */
  proxy?: HTMLElement;
}

/** id → element map for the CURRENT snapshot. Survives shadow DOM (attribute queries do not). */
export const registry = new Map<number, RegistryEntry>();
const tagged = new Set<Element>();

function resetRegistry(): void {
  for (const el of tagged) el.removeAttribute(AI_ID_ATTR);
  tagged.clear();
  registry.clear();
  // Also clean ids left by a previous (orphaned) instance of this script after an extension reload.
  document.querySelectorAll(`[${AI_ID_ATTR}]`).forEach((el) => el.removeAttribute(AI_ID_ATTR));
}

function shortHref(href: string): string {
  try {
    const u = new URL(href, location.href);
    if (u.protocol === 'javascript:') return 'javascript';
    const local = u.origin === location.origin ? `${u.pathname}${u.search}${u.hash}` : u.href;
    return truncate(local, 90);
  } catch {
    return truncate(href, 90);
  }
}

function boolAttr(el: Element, name: string): boolean | undefined {
  const v = el.getAttribute(name);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

function describeElement(el: HTMLElement, id: number): DistilledElement {
  const node: DistilledElement = {
    kind: 'element',
    id,
    tag: el.localName,
    role: computeRole(el),
    name: accessibleName(el),
    inViewport: isInViewport(el),
  };

  if (el instanceof HTMLInputElement) {
    node.inputType = el.type;
    if (isNativeCheckable(el)) {
      node.checked = el.checked;
      if (el.name) node.group = el.name;
    } else if (!['submit', 'button', 'reset', 'image', 'file'].includes(el.type)) {
      node.value = el.type === 'password' ? (el.value ? '••••••' : '') : cleanText(el.value, 120);
    }
    if (el.placeholder) node.placeholder = cleanText(el.placeholder, 80);
    if (el.required) node.required = true;
  } else if (el instanceof HTMLTextAreaElement) {
    node.value = cleanText(el.value, 200);
    if (el.placeholder) node.placeholder = cleanText(el.placeholder, 80);
    if (el.required) node.required = true;
  } else if (el instanceof HTMLSelectElement) {
    const options: DistilledOption[] = Array.from(el.options)
      .slice(0, 40)
      .map((o) => ({ value: cleanText(o.value, 60), text: cleanText(o.text, 80), selected: o.selected }));
    node.options = options;
    node.value = cleanText(el.selectedOptions[0]?.text ?? '', 80);
    if (el.required) node.required = true;
  } else {
    const checked = el.getAttribute('aria-checked');
    if (checked === 'true' || checked === 'false' || checked === 'mixed') node.checked = checked === 'true';
    const selected = boolAttr(el, 'aria-selected');
    if (selected !== undefined) node.selected = selected;
    if (el.isContentEditable) node.value = cleanText(el.innerText, 200);
    const valueNow = el.getAttribute('aria-valuenow');
    if (valueNow) node.value = valueNow;
  }

  const expanded = boolAttr(el, 'aria-expanded');
  if (expanded !== undefined) node.expanded = expanded;
  if ((el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true') node.disabled = true;
  if (el.getAttribute('aria-required') === 'true') node.required = true;
  if (el instanceof HTMLAnchorElement && el.getAttribute('href')) node.href = shortHref(el.href);

  // Avoid paying tokens twice for identical name/placeholder.
  if (node.placeholder && node.placeholder === node.name) delete node.placeholder;
  return node;
}

/**
 * Walks the rendered tree (document order, open shadow roots, slots) and produces a compact,
 * token-efficient representation: visible text blocks interleaved with interactive elements,
 * each interactive element tagged with a temporary `data-ai-id`.
 */
export function distillPage(maxNodes = MAX_SNAPSHOT_NODES, maxChars = MAX_SNAPSHOT_CHARS): PageSnapshot {
  resetRegistry();

  const nodes: DistilledNode[] = [];
  let nextId = 1;
  let chars = 0;
  let truncated = false;
  let lastText = '';

  const budgetExceeded = (): boolean => {
    if (nodes.length >= maxNodes || chars >= maxChars) truncated = true;
    return truncated;
  };

  const pushText = (text: string, tag: string): void => {
    if (!text || text.length < 2 || text === lastText || budgetExceeded()) return;
    const last = nodes[nodes.length - 1];
    if (last?.kind === 'element' && last.name === text) return; // label text already carried by the control
    lastText = text;
    chars += text.length;
    nodes.push({ kind: 'text', tag, text });
  };

  const pushElement = (el: HTMLElement, proxy?: HTMLElement): void => {
    if (budgetExceeded()) return;
    const id = nextId++;
    el.setAttribute(AI_ID_ATTR, String(id));
    tagged.add(el);
    registry.set(id, proxy ? { el, proxy } : { el });
    const node = describeElement(el, id);
    chars += node.name.length + (node.value?.length ?? 0) + 24;
    lastText = node.name;
    nodes.push(node);
  };

  const isInteractive = (el: Element, style: CSSStyleDeclaration, parentPointer: boolean): boolean => {
    if (el.matches(INTERACTIVE_SELECTOR)) return true;
    // Framework click handlers (React onClick on <div>/<li>) leave no attribute: use the cursor heuristic,
    // only at the outermost pointer element (cursor is inherited by descendants).
    if (style.cursor === 'pointer' && !parentPointer) {
      const text = (el as HTMLElement).innerText?.trim() ?? '';
      return (text.length > 0 && text.length < 300) || el.querySelector('img,svg') !== null;
    }
    return false;
  };

  const visit = (el: Element, parentPointer: boolean): void => {
    if (truncated) return;
    const tag = el.localName;
    if (SKIP_TAGS.has(tag)) return;

    const style = getComputedStyle(el);
    if (style.display === 'none') return;
    const isPointer = style.cursor === 'pointer';

    if (isInteractive(el, style, parentPointer) && !hasInteractiveDescendant(el)) {
      const html = el as HTMLElement;
      if (isVisible(el)) {
        pushElement(html);
      } else if (isNativeCheckable(el)) {
        // Custom-styled radios/checkboxes hide the native input and show a styled <label>.
        const label = visibleLabelFor(el);
        if (label) pushElement(html, label);
      }
      return;
    }

    if (isTextLeaf(el)) {
      if (el instanceof HTMLLabelElement && el.control) return; // name carried by its control
      if (isVisible(el)) pushText(cleanText((el as HTMLElement).innerText, 500), tag);
      return;
    }

    if (!(el instanceof HTMLLabelElement && el.control)) {
      const own = directText(el);
      if (own && isVisible(el)) pushText(own, tag);
    }

    for (const child of renderedChildren(el)) visit(child, isPointer);
  };

  if (document.body) visit(document.body, false);

  const scrollEl = document.scrollingElement ?? document.documentElement;
  return {
    url: location.href,
    title: document.title,
    scroll: {
      y: Math.round(window.scrollY),
      height: Math.round(scrollEl.scrollHeight),
      viewport: window.innerHeight,
    },
    nodes,
    interactiveCount: registry.size,
    truncated,
    capturedAt: Date.now(),
  };
}

export function resolveTarget(id: number): RegistryEntry | null {
  const entry = registry.get(id);
  if (entry && entry.el.isConnected) return entry;
  // Fallback: attribute lookup (light DOM) in case the registry was rebuilt in between.
  const el = document.querySelector<HTMLElement>(`[${AI_ID_ATTR}="${id}"]`);
  return el ? { el } : null;
}
