import type { SnippetAnchor } from './types.js';

/**
 * Deep-link anchoring: turn a DOM selection into a portable {@link SnippetAnchor}
 * and resolve one back to a `Range`, so a saved passage can be re-located (and
 * re-highlighted) on later visits — resilient to minor page edits.
 *
 * Strategies, most robust first:
 *   1. **text-quote** — the exact selected text plus a little surrounding
 *      context, disambiguated by prefix/suffix. Survives DOM restructuring and
 *      shifts elsewhere on the page.
 *   2. **text-position** — character offsets into the page's text. Fast, but
 *      brittle to edits *before* the passage.
 *   3. **selector** — a CSS selector for a container element (last resort).
 *
 * Build and resolve must use the same `root` (e.g. `document.body`) so offsets
 * line up. Built fresh for Tessera — no external anchoring dependency.
 */

/** Characters of surrounding context captured on each side of the quote. */
const CONTEXT_LENGTH = 32;

/** True when an anchor carries at least one usable re-location strategy. */
export function isResolvableAnchor(anchor: SnippetAnchor | undefined | null): boolean {
  if (!anchor) return false;
  return Boolean(
    (anchor.quote && anchor.quote.exact) || anchor.textPosition || anchor.selector,
  );
}

/** Extract the host (website grouping key) from a URL; '' if unparseable. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Build a {@link SnippetAnchor} from a DOM `Range` (typically a user selection),
 * measured against `root`. Captures both a text-quote (with context) and a
 * text-position strategy.
 */
export function anchorFromRange(range: Range, root: Element): SnippetAnchor {
  const full = textOf(root);
  const start = offsetWithin(root, range.startContainer, range.startOffset);
  const end = offsetWithin(root, range.endContainer, range.endOffset);
  return {
    quote: {
      exact: full.slice(start, end),
      prefix: full.slice(Math.max(0, start - CONTEXT_LENGTH), start),
      suffix: full.slice(end, Math.min(full.length, end + CONTEXT_LENGTH)),
    },
    textPosition: { start, end },
  };
}

/**
 * Resolve a {@link SnippetAnchor} to a `Range` within `root`, trying each
 * strategy in order of robustness. Returns `null` if the passage can't be found
 * (the caller should then degrade to "just open the page").
 */
export function resolveAnchor(anchor: SnippetAnchor, root: Element): Range | null {
  if (anchor.quote?.exact) {
    const range = resolveByQuote(root, anchor.quote, anchor.textPosition);
    if (range) return range;
  }
  if (anchor.textPosition) {
    const range = positionToRange(
      root,
      anchor.textPosition.start,
      anchor.textPosition.end,
    );
    if (range) return range;
  }
  if (anchor.selector) {
    const el = root.querySelector(anchor.selector);
    if (el) {
      const range = ownerDocument(root).createRange();
      range.selectNodeContents(el);
      return range;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

function resolveByQuote(
  root: Element,
  quote: NonNullable<SnippetAnchor['quote']>,
  hint: SnippetAnchor['textPosition'],
): Range | null {
  const { exact } = quote;
  if (!exact) return null;
  const full = textOf(root);

  const occurrences: number[] = [];
  for (let i = full.indexOf(exact); i !== -1; i = full.indexOf(exact, i + 1)) {
    occurrences.push(i);
  }
  if (occurrences.length === 0) return null;

  // Score each occurrence by how much of the saved prefix/suffix still matches,
  // using the saved position only as a tiny tie-breaker.
  const prefix = quote.prefix ?? '';
  const suffix = quote.suffix ?? '';
  let bestStart = occurrences[0] ?? 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const start of occurrences) {
    const end = start + exact.length;
    let score = 0;
    if (prefix) {
      score += commonSuffixLength(
        full.slice(Math.max(0, start - prefix.length), start),
        prefix,
      );
    }
    if (suffix) {
      score += commonPrefixLength(full.slice(end, end + suffix.length), suffix);
    }
    if (hint) score -= Math.abs(start - hint.start) / 1e6;
    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }
  return positionToRange(root, bestStart, bestStart + exact.length);
}

/** The plain-text content of `root`, in the units position offsets count in. */
function textOf(root: Element): string {
  const range = ownerDocument(root).createRange();
  range.selectNodeContents(root);
  return range.toString();
}

/** Global character offset of a (container, offset) boundary within `root`. */
function offsetWithin(root: Element, container: Node, offset: number): number {
  const range = ownerDocument(root).createRange();
  range.selectNodeContents(root);
  range.setEnd(container, offset);
  return range.toString().length;
}

/** Map a `[start, end)` character span back to a `Range`, or null if unmappable. */
function positionToRange(root: Element, start: number, end: number): Range | null {
  const range = ownerDocument(root).createRange();
  const nodes: Text[] = [];
  collectTextNodes(root, nodes);
  let acc = 0;
  let started = false;
  for (const text of nodes) {
    const len = text.data.length;
    if (!started && start <= acc + len) {
      range.setStart(text, start - acc);
      started = true;
    }
    if (started && end <= acc + len) {
      range.setEnd(text, end - acc);
      return range;
    }
    acc += len;
  }
  return null;
}

/** Collect descendant text nodes of `node` in document order. */
function collectTextNodes(node: Node, out: Text[]): void {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3 /* Node.TEXT_NODE */) out.push(child as Text);
    else collectTextNodes(child, out);
  }
}

function ownerDocument(root: Element): Document {
  const doc = root.ownerDocument;
  if (!doc) throw new Error('anchor: root element has no ownerDocument');
  return doc;
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

function commonSuffixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}
