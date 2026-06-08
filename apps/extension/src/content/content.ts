import { anchorFromRange, domainOf, resolveAnchor } from '@tessera/core';
import type { Snippet } from '@tessera/core';

/**
 * Tessera capture content script (M1).
 *
 * Text capture: select → floating "Save to Tessera" → deep-link anchor → save.
 * Re-highlight: on load, paint this page's saved passages with the CSS Custom
 * Highlight API (no DOM surgery).
 *
 * (Screenshot capture is injected on demand from the popup via
 * `chrome.scripting.executeScript`, so it doesn't depend on this script being
 * present in the tab.)
 */

const BUTTON_ID = 'tessera-save-button';
const HIGHLIGHT_NAME = 'tessera';
const STYLE_ID = 'tessera-highlight-style';

/* ---- text capture ------------------------------------------------------- */

function removeButton(): void {
  document.getElementById(BUTTON_ID)?.remove();
}

function showSaveButton(range: Range): void {
  removeButton();
  const rect = range.getBoundingClientRect();
  const btn = document.createElement('button');
  btn.id = BUTTON_ID;
  btn.textContent = 'Save to Tessera';
  Object.assign(btn.style, {
    position: 'absolute',
    top: `${window.scrollY + rect.top - 40}px`,
    left: `${window.scrollX + rect.left}px`,
    zIndex: '2147483647',
    padding: '6px 10px',
    font: '13px/1 system-ui, sans-serif',
    color: '#fff',
    background: '#4f46e5',
    border: 'none',
    borderRadius: '6px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>);
  btn.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void saveSelection(range);
    removeButton();
  });
  document.body.appendChild(btn);
}

async function saveSelection(range: Range): Promise<void> {
  const snippet = {
    type: 'text' as const,
    text: range.toString(),
    url: location.href,
    domain: domainOf(location.href),
    pageTitle: document.title,
    anchor: anchorFromRange(range, document.body),
  };
  try {
    await chrome.runtime.sendMessage({ type: 'tessera:capture', snippet });
    // Drop the native selection so the saved highlight is actually visible
    // (the blue selection paints on top of custom highlights).
    document.getSelection()?.removeAllRanges();
    await refreshHighlights();
  } catch (error) {
    console.error('[Tessera] save failed', error);
  }
}

function saveFromMenu(): void {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
  void saveSelection(selection.getRangeAt(0).cloneRange());
}

document.addEventListener('mouseup', () => {
  // Defer so the selection has settled before we read it.
  setTimeout(() => {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      removeButton();
      return;
    }
    showSaveButton(selection.getRangeAt(0).cloneRange());
  }, 0);
});

document.addEventListener('mousedown', (event) => {
  if ((event.target as Element | null)?.id !== BUTTON_ID) removeButton();
});

chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message.type === 'tessera:save-from-menu') saveFromMenu();
  // Re-paint after a delete from the popup so a removed highlight disappears
  // without needing a page reload.
  else if (message.type === 'tessera:refresh-highlights') void refreshHighlights();
});

/* ---- re-highlight ------------------------------------------------------- */

function highlightSupported(): boolean {
  return typeof Highlight !== 'undefined' && 'highlights' in CSS;
}

function ensureHighlightStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `::highlight(${HIGHLIGHT_NAME}){background-color:rgba(99,102,241,0.4);}`;
  document.head.appendChild(style);
}

function applyHighlights(snippets: Snippet[]): void {
  if (!highlightSupported()) {
    console.warn('[Tessera] CSS Custom Highlight API unavailable; skipping re-highlight');
    return;
  }
  const ranges: Range[] = [];
  for (const snippet of snippets) {
    if (!snippet.anchor) continue;
    const range = resolveAnchor(snippet.anchor, document.body);
    if (range) ranges.push(range);
  }
  console.info(
    `[Tessera] re-highlight: resolved ${ranges.length}/${snippets.length} snippet(s)`,
  );
  if (ranges.length === 0) {
    CSS.highlights.delete(HIGHLIGHT_NAME);
    return;
  }
  ensureHighlightStyle();
  CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
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

void refreshHighlights();
