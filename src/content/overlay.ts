/**
 * Visual feedback: a metallic chrome/silver box + caption around the element the agent is acting on.
 *
 * Uses a hyphenated custom element (no <div>) and CSSOM-only styling (`el.style`), which is
 * not subject to the page's CSP `style-src` restrictions — works on strict sites too.
 */
const HOST_TAG = 'newtonagent-overlay';
let box: HTMLElement | null = null;
let caption: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

function ensureOverlay(): { box: HTMLElement; caption: HTMLElement } {
  if (box && caption && box.isConnected) return { box, caption };
  box = document.createElement(HOST_TAG);
  caption = document.createElement(`${HOST_TAG}-caption`);
  Object.assign(box.style, {
    position: 'fixed',
    zIndex: '2147483647',
    pointerEvents: 'none',
    display: 'block',
    boxSizing: 'border-box',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.08)',
    boxShadow: '0 0 0 3px rgba(255, 255, 255, 0.20), 0 0 25px rgba(226, 232, 240, 0.55)',
    transition: 'all 140ms cubic-bezier(.2,.8,.2,1)',
    opacity: '0',
  } satisfies Partial<CSSStyleDeclaration>);
  Object.assign(caption.style, {
    position: 'absolute',
    left: '-2px',
    top: '-26px',
    display: 'block',
    maxWidth: '320px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    padding: '3px 8px',
    borderRadius: '6px',
    background: 'linear-gradient(135deg, #ffffff, #cbd5e1)',
    color: '#090a0f',
    font: '700 11px/1.5 system-ui, -apple-system, Segoe UI, sans-serif',
    letterSpacing: '0.02em',
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.45), 0 0 10px rgba(255, 255, 255, 0.35)',
  } satisfies Partial<CSSStyleDeclaration>);
  box.appendChild(caption);
  document.documentElement.appendChild(box);
  return { box, caption };
}

export function highlight(el: Element, label: string, durationMs = 1400): void {
  try {
    const { box: b, caption: c } = ensureOverlay();
    const r = el.getBoundingClientRect();
    const pad = 4;
    Object.assign(b.style, {
      left: `${r.left - pad}px`,
      top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
      opacity: '1',
    });
    c.textContent = `⚡ ${label}`;
    c.style.top = r.top < 30 ? `${r.height + pad * 2 + 4}px` : '-26px';
    clearTimeout(hideTimer);
    hideTimer = setTimeout(clearHighlight, durationMs);
  } catch {
    /* purely cosmetic */
  }
}

export function clearHighlight(): void {
  if (box) box.style.opacity = '0';
}

export function isOverlayNode(node: Node): boolean {
  return !!box && (node === box || box.contains(node));
}
