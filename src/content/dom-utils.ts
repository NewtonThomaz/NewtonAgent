import { cleanText } from '../shared/utils';

/** Subtrees that never contain useful, visible, interactive content. */
export const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'frame',
  'object',
  'embed',
  'meta',
  'link',
  'head',
  'audio',
  'picture',
  'source',
  'track',
  'map',
  'newtonagent-overlay',
]);

/** Phrasing (inline) tags — an element whose children are only these is treated as one text block. */
export const INLINE_TAGS = new Set([
  'span',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'small',
  'sub',
  'sup',
  'code',
  'kbd',
  'mark',
  'abbr',
  'br',
  'wbr',
  'img',
  'font',
  'q',
  'cite',
  'time',
  'var',
  'samp',
  'bdi',
  'bdo',
  'del',
  'ins',
  'data',
  'dfn',
]);

export const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  'video',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="option"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  '[role="menuitemcheckbox"]',
  '[role="tab"]',
  '[role="combobox"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="treeitem"]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[tabindex]:not([tabindex="-1"])',
  '[onclick]',
].join(',');

type CheckVisibilityOptions = {
  checkOpacity?: boolean;
  checkVisibilityCSS?: boolean;
  opacityProperty?: boolean;
  visibilityProperty?: boolean;
  contentVisibilityAuto?: boolean;
};

/**
 * True when the element is actually painted for a human: not hidden by CSS (including ancestors'
 * opacity/visibility via `checkVisibility`), has a non-trivial box and is not parked off-page
 * (skip-links, `.sr-only`, left:-9999px patterns).
 */
export function isVisible(el: Element): boolean {
  const withCheck = el as Element & { checkVisibility?: (o?: CheckVisibilityOptions) => boolean };
  if (typeof withCheck.checkVisibility === 'function') {
    const visible = withCheck.checkVisibility({
      checkOpacity: true,
      checkVisibilityCSS: true,
      opacityProperty: true,
      visibilityProperty: true,
    });
    if (!visible) return false;
  } else {
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width <= 1 && rect.height <= 1) return false;
  if (rect.right <= 0 || rect.bottom + window.scrollY <= 0) return false;
  return true;
}

export function isInViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

/**
 * Rendered children in the *flat tree*: descends into open shadow roots and resolves <slot>
 * assignments so Web-Component based PWAs (Lit, Stencil, Ionic…) are fully covered.
 */
export function renderedChildren(el: Element): Element[] {
  if (el instanceof HTMLSlotElement) {
    const assigned = el.assignedElements({ flatten: true });
    return assigned.length ? assigned : Array.from(el.children);
  }
  if (el.shadowRoot) return Array.from(el.shadowRoot.children);
  if (el instanceof HTMLIFrameElement) {
    try {
      const doc = el.contentDocument;
      if (doc && doc.body) return Array.from(doc.body.children);
    } catch {
      // Cross-origin iframe protegida pelo navegador
    }
  }
  return Array.from(el.children);
}

export function hasInteractiveDescendant(el: Element): boolean {
  if (el.querySelector(INTERACTIVE_SELECTOR)) return true;
  return el.shadowRoot ? el.shadowRoot.querySelector(INTERACTIVE_SELECTOR) !== null : false;
}

export function isTextLeaf(el: Element): boolean {
  if (el.shadowRoot) return false;
  for (const child of Array.from(el.children)) {
    if (!INLINE_TAGS.has(child.localName)) return false;
  }
  return !el.querySelector(INTERACTIVE_SELECTOR);
}

/** Concatenated text of direct child text nodes only. */
export function directText(el: Element): string {
  let out = '';
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) out += ` ${node.textContent ?? ''}`;
  });
  return cleanText(out, 400);
}

export type CheckableInputElement = HTMLInputElement & { type: 'checkbox' | 'radio' };

export function isNativeCheckable(el: Element): el is CheckableInputElement {
  return el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');
}

function labelsOf(el: Element): HTMLLabelElement[] {
  const labels = (el as Partial<HTMLInputElement>).labels;
  return labels ? Array.from(labels) : [];
}

/** First *visible* label bound to a (possibly visually hidden) form control. */
export function visibleLabelFor(el: Element): HTMLLabelElement | null {
  return labelsOf(el).find((l) => isVisible(l)) ?? null;
}

function textOf(el: Element | null | undefined): string {
  if (!el) return '';
  return (el as HTMLElement).innerText ?? el.textContent ?? '';
}

/** Pragmatic implementation of the accessible-name computation (aria → label → content → title). */
export function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return cleanText(aria);

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const scope = el.getRootNode() as Document | ShadowRoot;
    const text = labelledBy
      .split(/\s+/)
      .map((id) => textOf(scope.getElementById?.(id) ?? document.getElementById(id)))
      .join(' ');
    if (text.trim()) return cleanText(text);
  }

  const labels = labelsOf(el);
  if (labels.length) {
    const text = labels.map((l) => textOf(l)).join(' ');
    if (text.trim()) return cleanText(text);
  }

  if (el instanceof HTMLInputElement) {
    if (['submit', 'button', 'reset'].includes(el.type) && el.value) return cleanText(el.value);
    if (el.type === 'image' && el.alt) return cleanText(el.alt);
  }

  if (el instanceof HTMLVideoElement) {
    const status = el.paused ? 'Pausado' : 'Reproduzindo';
    const cur = Math.round(el.currentTime);
    const dur = Math.round(el.duration || 0);
    return cleanText(`Vídeo (${status}, ${cur}s/${dur}s)`);
  }

  if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) {
    const text = textOf(el);
    if (text.trim()) return cleanText(text);
    const img = el.querySelector('img[alt]');
    if (img?.getAttribute('alt')?.trim()) return cleanText(img.getAttribute('alt'));
  }

  const fallback =
    el.getAttribute('title') ||
    el.getAttribute('placeholder') ||
    el.getAttribute('data-placeholder') ||
    el.getAttribute('name') ||
    el.getAttribute('data-testid') ||
    '';
  return cleanText(fallback);
}

/** Normalized ARIA-ish role used in the prompt. */
export function computeRole(el: Element): string {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit.split(/\s+/)[0]!.toLowerCase();
  const tag = el.localName;
  if (tag === 'a') return 'link';
  if (tag === 'button' || tag === 'summary') return 'button';
  if (tag === 'video') return 'video';
  if (tag === 'select') return (el as HTMLSelectElement).multiple ? 'listbox' : 'select';
  if (tag === 'textarea') return 'textbox';
  if (el instanceof HTMLInputElement) {
    switch (el.type) {
      case 'checkbox':
        return 'checkbox';
      case 'radio':
        return 'radio';
      case 'submit':
      case 'button':
      case 'reset':
      case 'image':
        return 'button';
      case 'range':
        return 'slider';
      case 'file':
        return 'file';
      default:
        return 'textbox';
    }
  }
  if ((el as HTMLElement).isContentEditable) return 'textbox';
  return 'clickable';
}

/** Nearest ancestor that actually scrolls on the Y axis (for inner-scroll PWAs). */
export function scrollableAncestor(el: Element | null): Element | null {
  let node: Element | null = el;
  while (node && node !== document.documentElement) {
    const style = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 4) return node;
    node = node.parentElement ?? ((node.getRootNode() as ShadowRoot).host ?? null);
  }
  return null;
}

/** Largest scrollable container — used when the document itself does not scroll (app-shell PWAs). */
export function findMainScrollable(): Element | null {
  let best: Element | null = null;
  let bestArea = 0;
  const all = document.body?.querySelectorAll('*') ?? [];
  const limit = Math.min(all.length, 5000);
  for (let i = 0; i < limit; i++) {
    const el = all[i]!;
    if (el.scrollHeight <= el.clientHeight + 20) continue;
    const style = getComputedStyle(el);
    if (!/(auto|scroll|overlay)/.test(style.overflowY)) continue;
    const area = el.clientWidth * el.clientHeight;
    if (area > bestArea) {
      bestArea = area;
      best = el;
    }
  }
  return best;
}
