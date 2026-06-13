import {
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_COLORS,
  DROP_WHOLE_ANCESTOR_SELECTOR,
  anchorFromRange,
  domainOf,
  highlightFill,
  highlightGroupKey,
  resolveAnchor,
  serializeSelection,
} from '@tessera/core';
import type { Snippet } from '@tessera/core';

/**
 * Tessera capture content script.
 *
 * Selection → a floating highlighter button (one click saves in your default
 * color; a ▾ expander reveals the palette) → a deep-link anchor → save. Saved
 * passages re-paint on revisit via the CSS Custom Highlight API (no DOM surgery),
 * each in its own color, and re-resolve on dynamic/SPA page changes. Clicking an
 * existing highlight opens a quick-menu (recolor / note / open / delete).
 *
 * Implements the Selection & Highlight spec v0.1 (SEL / CLR / RHL / ACT / ANC).
 * Our own UI lives in a shadow root on <html> so the page can't restyle it and
 * our DOM never feeds back into the MutationObserver (which watches <body>).
 *
 * (Screenshot capture is injected on demand from the popup via
 * `chrome.scripting.executeScript`, independent of this script.)
 */

const UI_HOST_ID = 'tessera-ui-host';
const STYLE_ID = 'tessera-highlight-style';
const DEFAULT_COLOR_KEY = 'tessera:default-color';
const env = import.meta.env as Record<string, string | undefined>;
const PLATFORM_URL = env.VITE_WEB_URL ?? 'http://localhost:3001';

/* ---- module state ------------------------------------------------------- */

let shadow: ShadowRoot | null = null;
let currentRange: Range | null = null;
let lastColor = DEFAULT_HIGHLIGHT_COLOR.hex; // default color; seeded from storage, updated on save/recolor (CLR-3/4)
let painted: Array<{ snippet: Snippet; range: Range }> = []; // for click hit-testing (ACT)
let activeGroups = new Set<string>(); // CSS.highlights group names we currently own
let menuX = 0;
let menuY = 0;
let reapplyTimer: ReturnType<typeof setTimeout> | undefined;
let noteEditor: { snippet: Snippet; textarea: HTMLTextAreaElement; initial: string } | null = null;

/** Set the default highlight color and remember it across reloads (CLR-3/4). */
function setDefaultColor(color: string): void {
  lastColor = color;
  try {
    void chrome.storage.local.set({ [DEFAULT_COLOR_KEY]: color });
  } catch {
    // storage may be unavailable in some frames; the in-memory default still applies
  }
}

/* ---- shadow-root UI host ------------------------------------------------ */

const UI_CSS = `
:host { all: initial; }
.tsr-toolbar, .tsr-menu {
  position: fixed; z-index: 2147483647; pointer-events: auto;
  background: #1e293b; color: #e2e8f0; border-radius: 9px;
  box-shadow: 0 6px 22px rgba(0,0,0,.28); padding: 6px;
  font: 13px/1.4 system-ui, -apple-system, sans-serif;
  border: 1px solid rgba(148, 163, 184, 0.18);
  display: flex; gap: 6px; align-items: center;
}
.tsr-menu { flex-direction: column; align-items: stretch; min-width: 168px; max-width: 340px; }
.tsr-menu-colors { display: flex; gap: 6px; padding: 2px 2px 4px; }
.tsr-highlight-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 28px; padding: 0; border: 0; border-radius: 6px;
  background: transparent; color: #e2e8f0; cursor: pointer;
}
.tsr-highlight-btn:hover, .tsr-highlight-btn:focus-visible { background: rgba(255,255,255,.14); outline: none; }
.tsr-caret {
  appearance: none; border: 0; background: transparent; color: #cbd5e1; cursor: pointer;
  font: 12px/1 system-ui, sans-serif; padding: 5px; border-radius: 6px;
}
.tsr-caret:hover, .tsr-caret:focus-visible { background: rgba(255,255,255,.14); outline: none; }
.tsr-swatches { display: none; gap: 6px; align-items: center; }
.tsr-toolbar.is-expanded .tsr-swatches { display: flex; }
.tsr-confirm-label { color: #e2e8f0; padding: 4px 9px 2px; font-size: 12px; }
.tsr-swatch {
  width: 20px; height: 20px; padding: 0; border-radius: 50%; cursor: pointer;
  background: var(--c); border: 2px solid rgba(255,255,255,.35);
}
.tsr-swatch:hover, .tsr-swatch:focus-visible { border-color: #fff; outline: none; }
.tsr-swatch.is-active { border-color: #fff; box-shadow: 0 0 0 2px #1e293b, 0 0 0 3px #fff; }
.tsr-item {
  appearance: none; border: 0; background: transparent; color: #e2e8f0;
  text-align: left; padding: 7px 9px; border-radius: 6px; cursor: pointer; font: inherit;
}
.tsr-item:hover, .tsr-item:focus-visible { background: rgba(255,255,255,.12); outline: none; }
.tsr-danger { color: #fca5a5; }
.tsr-note-box { width: 320px; }
.tsr-note {
  width: 100%; box-sizing: border-box; min-height: 74px; max-height: 220px; resize: none;
  border: 1px solid #cbd5e1; border-radius: 7px; padding: 8px;
  font: inherit; line-height: 1.45; color: #0f172a; background: #f8fafc;
}
.tsr-note::placeholder { color: #94a3b8; }
.tsr-note:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,.35); }
.tsr-note, .tsr-note-read-text { scrollbar-width: thin; scrollbar-color: rgba(100,116,139,.5) transparent; }
.tsr-note::-webkit-scrollbar, .tsr-note-read-text::-webkit-scrollbar { width: 10px; height: 10px; }
.tsr-note::-webkit-scrollbar-track, .tsr-note-read-text::-webkit-scrollbar-track { background: transparent; }
.tsr-note::-webkit-scrollbar-thumb, .tsr-note-read-text::-webkit-scrollbar-thumb {
  background: rgba(100,116,139,.5); border-radius: 999px; border: 3px solid transparent; background-clip: padding-box;
}
.tsr-note::-webkit-scrollbar-thumb:hover, .tsr-note-read-text::-webkit-scrollbar-thumb:hover {
  background: rgba(100,116,139,.75); background-clip: padding-box;
}
.tsr-note-read {
  margin: 4px 2px 6px; padding: 7px 9px; border-radius: 7px;
  background: rgba(148,163,184,.12); border-left: 3px solid #6366f1;
}
.tsr-note-read-label {
  color: #94a3b8; font-size: 10px; font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; margin-bottom: 2px;
}
.tsr-note-read-text {
  color: #e2e8f0; font-size: 12.5px; line-height: 1.45; white-space: pre-wrap;
  overflow-wrap: anywhere; max-height: 90px; overflow-y: auto;
}
.tsr-note-actions { display: flex; align-items: center; gap: 8px; padding: 4px 2px 2px; }
.tsr-note-actions-right { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.tsr-note-hint { color: #64748b; font-size: 11px; white-space: nowrap; }
.tsr-btn { appearance: none; border: 0; border-radius: 7px; padding: 6px 12px; font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; }
.tsr-btn-primary { background: #6366f1; color: #fff; }
.tsr-btn-primary:hover, .tsr-btn-primary:focus-visible { background: #4f46e5; outline: none; }
.tsr-btn-ghost { background: transparent; color: #cbd5e1; padding: 6px 8px; }
.tsr-btn-ghost:hover, .tsr-btn-ghost:focus-visible { background: rgba(255,255,255,.12); outline: none; }
.tsr-btn-ghost.tsr-danger { color: #fca5a5; }
.tsr-toast {
  position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
  z-index: 2147483647; pointer-events: none;
  background: #1e293b; color: #e2e8f0; border: 1px solid rgba(148,163,184,.18);
  border-radius: 8px; padding: 8px 12px; font: 13px/1.4 system-ui, sans-serif;
  box-shadow: 0 6px 22px rgba(0,0,0,.28);
}
.tsr-toast-error { color: #fecaca; }
@media (prefers-reduced-motion: no-preference) {
  .tsr-toolbar, .tsr-menu { transition: opacity .12s ease; }
}
`;

function ui(): ShadowRoot {
  if (shadow) return shadow;
  const host = document.createElement('div');
  host.id = UI_HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  document.documentElement.appendChild(host);
  shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = UI_CSS;
  shadow.appendChild(style);
  return shadow;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/** Place an element above `rect`, flipping below when there's no room (SEL-2). */
function placeAbove(el: HTMLElement, rect: DOMRect): void {
  el.style.visibility = 'hidden';
  el.style.display = 'flex';
  const w = el.offsetWidth || 180;
  const h = el.offsetHeight || 36;
  const gap = 8;
  let top = rect.top - h - gap;
  if (top < gap) top = rect.bottom + gap;
  el.style.left = `${clamp(rect.left, gap, window.innerWidth - w - gap)}px`;
  el.style.top = `${clamp(top, gap, window.innerHeight - h - gap)}px`;
  el.style.visibility = 'visible';
}

/** Place an element near a point, kept within the viewport. */
function placeAt(el: HTMLElement, x: number, y: number): void {
  el.style.visibility = 'hidden';
  el.style.display = 'flex';
  const w = el.offsetWidth || 180;
  const h = el.offsetHeight || 40;
  const gap = 8;
  el.style.left = `${clamp(x, gap, window.innerWidth - w - gap)}px`;
  el.style.top = `${clamp(y + gap, gap, window.innerHeight - h - gap)}px`;
  el.style.visibility = 'visible';
}

/* ---- selection & save toolbar ------------------------------------------- */

/** The active, non-empty text selection range, or null (ignores form fields). */
function activeSelectionRange(): Range | null {
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  if (!sel.toString().trim()) return null;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return null;
  return sel.getRangeAt(0);
}

function isToolbarVisible(): boolean {
  const bar = shadow?.querySelector<HTMLElement>('.tsr-toolbar');
  return !!bar && bar.style.display !== 'none';
}

function hideToolbar(): void {
  const bar = shadow?.querySelector<HTMLElement>('.tsr-toolbar');
  if (bar) bar.style.display = 'none';
  currentRange = null;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** preventDefault + stopPropagation so clicking a control keeps the live selection. */
function keepSelection(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

/** The highlighter icon button — one click saves the selection in the default color. */
function buildHighlightButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tsr-highlight-btn';
  button.title = 'Highlight (your default color)';
  button.setAttribute('aria-label', 'Highlight selection in your default color');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const ink = document.createElementNS(SVG_NS, 'path');
  ink.setAttribute('class', 'tsr-ink');
  ink.setAttribute('d', 'm9 11-6 6v3h9l3-3');
  const body = document.createElementNS(SVG_NS, 'path');
  body.setAttribute('d', 'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4');
  body.setAttribute('stroke', '#e2e8f0');
  svg.appendChild(ink);
  svg.appendChild(body);
  button.appendChild(svg);
  button.addEventListener('mousedown', keepSelection);
  button.addEventListener('click', (event) => {
    keepSelection(event);
    if (currentRange) void saveSelection(currentRange, lastColor);
  });
  return button;
}

/** Build the toolbar: highlighter icon, a ▾ color expander, the palette, and a signed-out cue. */
function buildToolbarContent(bar: HTMLDivElement): void {
  bar.appendChild(buildHighlightButton());

  const caret = document.createElement('button');
  caret.type = 'button';
  caret.className = 'tsr-caret';
  caret.textContent = '▾';
  caret.title = 'Choose a color';
  caret.setAttribute('aria-label', 'Choose a highlight color');
  caret.setAttribute('aria-expanded', 'false');
  caret.addEventListener('mousedown', keepSelection);
  caret.addEventListener('click', (event) => {
    keepSelection(event);
    const expanded = bar.classList.toggle('is-expanded');
    caret.setAttribute('aria-expanded', String(expanded));
    if (currentRange) placeAbove(bar, currentRange.getBoundingClientRect());
  });
  bar.appendChild(caret);

  const swatches = document.createElement('div');
  swatches.className = 'tsr-swatches';
  for (const color of HIGHLIGHT_COLORS) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'tsr-swatch';
    swatch.dataset.color = color.hex;
    swatch.style.setProperty('--c', color.hex);
    swatch.title = `Highlight — ${color.label}`;
    swatch.setAttribute('aria-label', `Highlight in ${color.label}`);
    swatch.addEventListener('mousedown', keepSelection);
    swatch.addEventListener('click', (event) => {
      keepSelection(event);
      if (currentRange) void saveSelection(currentRange, color.hex);
    });
    swatches.appendChild(swatch);
  }
  bar.appendChild(swatches);
}

function showToolbar(range: Range): void {
  const root = ui();
  hideMenu();
  let bar = root.querySelector<HTMLDivElement>('.tsr-toolbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'tsr-toolbar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Highlight');
    buildToolbarContent(bar);
    root.appendChild(bar);
  }
  // Collapse the palette, reflect the default color (icon ink + active swatch), and the auth cue.
  bar.classList.remove('is-expanded');
  bar.querySelector('.tsr-caret')?.setAttribute('aria-expanded', 'false');
  bar.querySelector('.tsr-ink')?.setAttribute('stroke', lastColor);
  bar.querySelectorAll<HTMLElement>('.tsr-swatch').forEach((swatch) => {
    swatch.classList.toggle('is-active', swatch.dataset.color === lastColor);
  });
  currentRange = range.cloneRange();
  bar.style.display = 'flex';
  placeAbove(bar, range.getBoundingClientRect());
}

/** Build a text snippet payload (SEL-7: structure-preserving text + html, favicon, anchor, color) and save it. */
async function saveSelection(range: Range, color: string): Promise<void> {
  // Capture a structure-aware plain text + sanitized structural HTML (headings,
  // lists, line breaks, emphasis) so the passage re-displays faithfully (CAP-3).
  // Inline images in the selection are kept too (IMG-1): the serializer emits an
  // attribute-free `<img data-tsr-img="N">` token per image, and we collect the
  // matching live sources (in the same order) for the background to fetch + copy
  // into Storage (IMG-3/4) — the content script can't (page CORS).
  const liveImages = liveSelectionImages(range).slice(0, MAX_INLINE_IMAGES);
  const { html, text } = serializeSelection(range.cloneContents(), {
    images: liveImages.length > 0,
    // Resolve relative link hrefs against the page so saved links stay valid
    // when the passage is re-displayed off-site (library / popup / panel).
    baseUrl: document.baseURI,
  });
  const images = liveImages.length > 0 ? liveImages.map(resolveImageSrc) : undefined;
  const snippet: Partial<Snippet> = {
    type: 'text',
    text: text || range.toString(),
    html: html || undefined,
    url: location.href,
    domain: domainOf(location.href),
    pageTitle: document.title,
    faviconUrl: pageFavicon(),
    anchor: anchorFromRange(range, document.body),
    color,
  };
  setDefaultColor(color);
  try {
    await chrome.runtime.sendMessage({ type: 'tessera:capture', snippet, images });
    // Drop the native selection so the saved highlight is visible (the blue
    // selection paints on top of custom highlights). The highlight appearing in
    // its color is the save confirmation (SEL-9: no toast).
    document.getSelection()?.removeAllRanges();
    hideToolbar();
    await refreshHighlights();
  } catch (error) {
    console.error('[Tessera] save failed', error);
  }
}

/** Right-click menu + Alt+Shift+H both route here, saving in the last-used color. */
function saveFromMenu(): void {
  const range = activeSelectionRange();
  if (range) void saveSelection(range.cloneRange(), lastColor);
}

function pageFavicon(): string | undefined {
  const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (link?.href) return link.href;
  try {
    return new URL('/favicon.ico', location.origin).href;
  } catch {
    return undefined;
  }
}

/* ---- inline image capture (IMG) ----------------------------------------- */

const MAX_INLINE_IMAGES = 20;

/**
 * The capturable images inside a selection, in document order — the same set the
 * serializer emits `<img data-tsr-img="N">` tokens for, so indices line up. Read
 * from the *live* DOM (a cloned fragment has no `currentSrc`/layout) and skip
 * images inside dropped containers, matching the serializer (DROP_WHOLE).
 */
function liveSelectionImages(range: Range): HTMLImageElement[] {
  const root = range.commonAncestorContainer;
  const scope = root.nodeType === Node.ELEMENT_NODE ? (root as Element) : root.parentElement;
  if (!scope) return [];
  return Array.from(scope.querySelectorAll('img')).filter(
    (img) => range.intersectsNode(img) && !img.closest(DROP_WHOLE_ANCESTOR_SELECTOR),
  );
}

/**
 * Resolve a live image to an absolute raster source, or `null` to drop its token
 * (IMG-2/3): skip images with no usable source, odd schemes, or sub-icon size
 * (decorative / spacer / tracking pixels). The background fetches + uploads the
 * returned URL; `null` indices are stripped from the saved html.
 */
function resolveImageSrc(img: HTMLImageElement): string | null {
  const raw =
    img.currentSrc ||
    img.getAttribute('src') ||
    img.getAttribute('data-src') ||
    img.getAttribute('data-original') ||
    '';
  if (!raw) return null;
  let abs: string;
  try {
    abs = new URL(raw, location.href).href;
  } catch {
    return null;
  }
  if (!/^(https?:|data:image\/)/i.test(abs)) return null;
  const rect = img.getBoundingClientRect();
  const w = rect.width || img.naturalWidth;
  const h = rect.height || img.naturalHeight;
  if (w < 32 || h < 32) return null;
  return abs;
}

/* ---- acting on an existing highlight (ACT) ------------------------------ */

interface CaretDocument {
  caretRangeFromPoint?(x: number, y: number): Range | null;
}

/** Which saved snippet (if any) sits under a viewport point. */
function hitTest(x: number, y: number): Snippet | null {
  const caret = (document as unknown as CaretDocument).caretRangeFromPoint?.(x, y);
  if (!caret) return null;
  for (const entry of painted) {
    try {
      if (entry.range.isPointInRange(caret.startContainer, caret.startOffset)) {
        return entry.snippet;
      }
    } catch {
      // A range can detach after DOM edits; skip it (a refresh will rebuild).
    }
  }
  return null;
}

function hideMenu(): void {
  noteEditor = null;
  shadow?.querySelectorAll('.tsr-menu').forEach((menu) => menu.remove());
}

function menuItem(label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tsr-item';
  button.setAttribute('role', 'menuitem');
  button.textContent = label;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function showMenu(snippet: Snippet, x: number, y: number): void {
  const root = ui();
  hideToolbar();
  hideMenu();
  menuX = x;
  menuY = y;

  const menu = document.createElement('div');
  menu.className = 'tsr-menu';
  menu.setAttribute('role', 'menu');

  const colors = document.createElement('div');
  colors.className = 'tsr-menu-colors';
  for (const color of HIGHLIGHT_COLORS) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'tsr-swatch';
    swatch.style.setProperty('--c', color.hex);
    swatch.title = color.label;
    swatch.setAttribute('aria-label', `Recolor ${color.label}`);
    if (snippet.color === color.hex) swatch.classList.add('is-active');
    swatch.addEventListener('click', (event) => {
      event.stopPropagation();
      setDefaultColor(color.hex); // the menu's recolor also sets the user's default
      void updateSnippet(snippet.id, { color: color.hex });
    });
    colors.appendChild(swatch);
  }
  menu.appendChild(colors);

  if (snippet.note?.trim()) {
    // N2: show the note inline (read) so it's visible without entering edit mode.
    const noteRead = document.createElement('div');
    noteRead.className = 'tsr-note-read';
    noteRead.style.borderLeftColor = snippet.color ?? '#6366f1';
    const label = document.createElement('div');
    label.className = 'tsr-note-read-label';
    label.textContent = 'Note';
    const text = document.createElement('div');
    text.className = 'tsr-note-read-text';
    text.textContent = snippet.note;
    noteRead.append(label, text);
    menu.appendChild(noteRead);
  }
  menu.appendChild(menuItem(snippet.note ? 'Edit note' : 'Add note', () => openNote(snippet)));
  menu.appendChild(
    menuItem('Open in Tessera', () => {
      window.open(`${PLATFORM_URL}/snippet/${snippet.id}`, '_blank', 'noopener');
      hideMenu();
    }),
  );
  const del = menuItem('Delete', () => showDeleteConfirm(snippet));
  del.classList.add('tsr-danger');
  menu.appendChild(del);

  root.appendChild(menu);
  (menu.querySelector('button') as HTMLElement | null)?.focus(); // a11y: focus into the menu
  placeAt(menu, x, y);
}

/** Two-step delete confirm — in-page delete is otherwise immediate and irreversible. */
function showDeleteConfirm(snippet: Snippet): void {
  const root = ui();
  hideMenu();
  const menu = document.createElement('div');
  menu.className = 'tsr-menu';
  menu.setAttribute('role', 'menu');
  const label = document.createElement('div');
  label.className = 'tsr-confirm-label';
  label.textContent = 'Delete this highlight?';
  menu.appendChild(label);
  const del = menuItem('Delete', () => void deleteSnippet(snippet.id));
  del.classList.add('tsr-danger');
  menu.appendChild(del);
  menu.appendChild(menuItem('Cancel', () => showMenu(snippet, menuX, menuY)));
  root.appendChild(menu);
  (menu.querySelector('button') as HTMLElement | null)?.focus();
  placeAt(menu, menuX, menuY);
}

/** A brief, auto-dismissing corner message — used to surface save failures (N3). */
function flashToast(message: string, isError = false): void {
  const root = ui();
  const toast = document.createElement('div');
  toast.className = isError ? 'tsr-toast tsr-toast-error' : 'tsr-toast';
  toast.textContent = message;
  root.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function openNote(snippet: Snippet): void {
  const root = ui();
  hideMenu();
  const box = document.createElement('div');
  box.className = 'tsr-menu tsr-note-box';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Edit note');

  const textarea = document.createElement('textarea');
  textarea.className = 'tsr-note';
  textarea.value = snippet.note ?? '';
  textarea.placeholder = 'Add a note…';
  textarea.setAttribute('aria-label', 'Note');
  const grow = (): void => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  };
  textarea.addEventListener('input', grow);
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commitNote();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelNote();
    }
    event.stopPropagation(); // our editing keys; don't reach the page-level handlers
  });
  box.appendChild(textarea);

  const actions = document.createElement('div');
  actions.className = 'tsr-note-actions';
  if (snippet.note?.trim()) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'tsr-btn tsr-btn-ghost tsr-danger';
    remove.textContent = 'Remove';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      noteEditor = null;
      // Clear with '' not undefined — chrome messaging strips undefined keys.
      void updateSnippet(snippet.id, { note: '' });
    });
    actions.appendChild(remove);
  }
  const right = document.createElement('div');
  right.className = 'tsr-note-actions-right';
  const hint = document.createElement('span');
  hint.className = 'tsr-note-hint';
  hint.textContent = '⌘↵';
  hint.title = 'Press ⌘/Ctrl + Enter to save';
  right.appendChild(hint);
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'tsr-btn tsr-btn-ghost';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', (event) => {
    event.stopPropagation();
    cancelNote();
  });
  right.appendChild(cancel);
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'tsr-btn tsr-btn-primary';
  save.textContent = 'Save';
  save.addEventListener('click', (event) => {
    event.stopPropagation();
    commitNote();
  });
  right.appendChild(save);
  actions.appendChild(right);
  box.appendChild(actions);

  root.appendChild(box);
  noteEditor = { snippet, textarea, initial: snippet.note ?? '' };
  placeAt(box, menuX, menuY);
  grow();
  textarea.focus();
}

/** Persist the open note (only if changed); empty clears it. Triggered only by an explicit Save (Save button or ⌘↵). */
function commitNote(): void {
  if (!noteEditor) return;
  const { snippet, textarea, initial } = noteEditor;
  const value = textarea.value.trim();
  noteEditor = null;
  // Send '' (not undefined) to clear — chrome messaging strips undefined keys.
  if (value !== initial.trim()) void updateSnippet(snippet.id, { note: value });
  else hideMenu();
}

function cancelNote(): void {
  noteEditor = null;
  hideMenu();
}

async function updateSnippet(id: string, patch: Partial<Snippet>): Promise<void> {
  hideMenu();
  try {
    await chrome.runtime.sendMessage({ type: 'tessera:update', id, patch });
    await refreshHighlights();
  } catch (error) {
    console.error('[Tessera] update failed', error);
    flashToast('Couldn’t save — please try again', true);
  }
}

async function deleteSnippet(id: string): Promise<void> {
  hideMenu();
  try {
    await chrome.runtime.sendMessage({ type: 'tessera:delete', id });
    await refreshHighlights();
  } catch (error) {
    console.error('[Tessera] delete failed', error);
  }
}

/* ---- re-highlight (RHL) ------------------------------------------------- */

function highlightSupported(): boolean {
  return typeof Highlight !== 'undefined' && 'highlights' in CSS;
}

function styleEl(): HTMLStyleElement {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    (document.head ?? document.documentElement).appendChild(style);
  }
  return style;
}

/** Resolve every snippet's anchor and paint it, one CSS highlight group per color (RHL-2). */
function applyHighlights(snippets: Snippet[]): void {
  painted = [];
  if (!highlightSupported()) {
    console.warn('[Tessera] CSS Custom Highlight API unavailable; skipping re-highlight');
    return;
  }
  const groups = new Map<string, { fill: string; noted: boolean; ranges: Range[] }>();
  for (const snippet of snippets) {
    if (!snippet.anchor) continue;
    const range = resolveAnchor(snippet.anchor, document.body);
    if (!range) continue;
    painted.push({ snippet, range });
    const noted = Boolean(snippet.note?.trim()); // N4: noted highlights get a dotted underline
    const key = `tessera-${highlightGroupKey(snippet.color)}${noted ? '-noted' : ''}`;
    const group = groups.get(key) ?? { fill: highlightFill(snippet.color), noted, ranges: [] };
    group.ranges.push(range);
    groups.set(key, group);
  }
  console.info(`[Tessera] re-highlight: resolved ${painted.length}/${snippets.length} snippet(s)`);

  // Drop groups we no longer use, then (re)register the current ones + their styles.
  for (const key of activeGroups) {
    if (!groups.has(key)) CSS.highlights.delete(key);
  }
  activeGroups = new Set(groups.keys());
  const rules: string[] = [];
  for (const [key, group] of groups) {
    CSS.highlights.set(key, new Highlight(...group.ranges));
    const underline = group.noted ? 'text-decoration: underline dotted;' : '';
    rules.push(`::highlight(${key}){background-color:${group.fill};${underline}}`);
  }
  styleEl().textContent = rules.join('\n');
}

async function refreshHighlights(): Promise<void> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'tessera:get-snippets',
      url: location.href,
    })) as { snippets?: Snippet[] } | undefined;
    applyHighlights(response?.snippets ?? []);
  } catch (error) {
    console.error('[Tessera] refresh highlights failed', error);
  }
}

/** Debounced re-resolve, for dynamic / SPA pages whose content arrives or changes late (RHL-4). */
function scheduleReapply(): void {
  clearTimeout(reapplyTimer);
  reapplyTimer = setTimeout(() => void refreshHighlights(), 600);
}

/* ---- event wiring ------------------------------------------------------- */

document.addEventListener('mouseup', (event) => {
  // A mouseup inside our own UI (e.g. clicking the ▾ expander) must not re-run
  // showToolbar — that would collapse the palette the click just opened (a "blink").
  if (shadow && event.composedPath().includes(shadow.host)) return;
  // Defer so the selection has settled before we read it.
  setTimeout(() => {
    const range = activeSelectionRange();
    if (range) showToolbar(range);
    else hideToolbar();
  }, 0);
});

// Keyboard-made selections (Shift+arrows, etc.) never fire mouseup (SEL-4).
const SELECTION_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'Shift',
]);
document.addEventListener('keyup', (event) => {
  if (!SELECTION_KEYS.has(event.key)) return;
  const range = activeSelectionRange();
  if (range) showToolbar(range);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideToolbar();
    hideMenu();
  } else if (event.key === 'Enter' && currentRange && isToolbarVisible()) {
    event.preventDefault();
    void saveSelection(currentRange, lastColor); // SEL-9: Enter confirms in last color
  }
});

document.addEventListener('mousedown', (event) => {
  // Clicks inside our own UI shouldn't dismiss it.
  if (shadow && event.composedPath().includes(shadow.host)) return;
  // An open note editor discards on outside-click — edits persist only via an
  // explicit Save (the Save button or ⌘↵), so a stray click never commits.
  if (noteEditor) {
    cancelNote();
    return;
  }
  hideToolbar();
  hideMenu();
});

document.addEventListener('click', (event) => {
  if (event.button !== 0) return;
  if (activeSelectionRange()) return; // a live selection: the save flow owns this
  if (shadow && event.composedPath().includes(shadow.host)) return;
  // Don't hijack clicks on interactive elements (links, buttons, fields).
  const target = event.target as Element | null;
  if (target?.closest('a, button, input, select, textarea, [contenteditable]')) return;
  const hit = hitTest(event.clientX, event.clientY);
  if (hit) {
    event.preventDefault();
    showMenu(hit, event.clientX, event.clientY);
  } else {
    hideMenu();
  }
});

document.addEventListener(
  'scroll',
  () => {
    hideToolbar();
    hideMenu();
  },
  true,
);

window.addEventListener('popstate', scheduleReapply);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleReapply();
});

chrome.runtime.onMessage.addListener((message: { type?: string }, _sender, sendResponse) => {
  if (message.type === 'tessera:save-from-menu') saveFromMenu();
  else if (message.type === 'tessera:refresh-highlights') void refreshHighlights();
  else if (message.type === 'tessera:get-status') {
    // Live count so the popup can flag highlights that couldn't be re-located (ANC-4).
    sendResponse({ resolved: painted.length });
    return true;
  }
});

/* ---- init --------------------------------------------------------------- */

// Watch <body> for late-loaded / SPA-rendered content. Our UI host is on <html>
// and highlights use the Custom Highlight API (no DOM nodes), so this never
// observes our own mutations.
if (document.body) {
  new MutationObserver(scheduleReapply).observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Seed the default highlight color from storage (the user's last-used pick).
void chrome.storage.local
  .get(DEFAULT_COLOR_KEY)
  .then((items) => {
    const stored = (items as Record<string, unknown>)[DEFAULT_COLOR_KEY];
    if (typeof stored === 'string') lastColor = stored;
  })
  .catch(() => {});

void refreshHighlights();
