// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  anchorFromRange,
  domainOf,
  isResolvableAnchor,
  resolveAnchor,
} from './anchor.js';

function mount(html: string): HTMLElement {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

/** A Range over the first occurrence of `needle` within a single text node. */
function rangeOver(root: HTMLElement, needle: string): Range {
  const nodes: Text[] = [];
  (function walk(node: Node) {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 3) nodes.push(child as Text);
      else walk(child);
    }
  })(root);
  for (const text of nodes) {
    const idx = text.data.indexOf(needle);
    if (idx !== -1) {
      const range = document.createRange();
      range.setStart(text, idx);
      range.setEnd(text, idx + needle.length);
      return range;
    }
  }
  throw new Error(`needle not found: ${needle}`);
}

/** Global character offset of a range's start within root. */
function startOffsetOf(root: HTMLElement, range: Range): number {
  const probe = document.createRange();
  probe.selectNodeContents(root);
  probe.setEnd(range.startContainer, range.startOffset);
  return probe.toString().length;
}

const SENTENCE = '<p>The mitochondria is the powerhouse of the cell.</p>';

describe('domainOf', () => {
  it('extracts the host, or empty string for junk', () => {
    expect(domainOf('https://en.wikipedia.org/wiki/Cell')).toBe('en.wikipedia.org');
    expect(domainOf('not a url')).toBe('');
  });
});

describe('anchorFromRange', () => {
  it('captures the exact quote, surrounding context, and position', () => {
    const root = mount(SENTENCE);
    const anchor = anchorFromRange(rangeOver(root, 'powerhouse'), root);

    expect(anchor.quote?.exact).toBe('powerhouse');
    expect(anchor.quote?.prefix?.endsWith('is the ')).toBe(true);
    expect(anchor.quote?.suffix?.startsWith(' of the')).toBe(true);
    expect(isResolvableAnchor(anchor)).toBe(true);

    const text = 'The mitochondria is the powerhouse of the cell.';
    const { start, end } = anchor.textPosition ?? { start: 0, end: 0 };
    expect(text.slice(start, end)).toBe('powerhouse');
  });
});

describe('resolveAnchor', () => {
  it('round-trips a selection back to the same text', () => {
    const root = mount(SENTENCE);
    const anchor = anchorFromRange(rangeOver(root, 'powerhouse'), root);
    expect(resolveAnchor(anchor, root)?.toString()).toBe('powerhouse');
  });

  it('survives DOM edits before the passage via the text-quote', () => {
    const root = mount(SENTENCE);
    const anchor = anchorFromRange(rangeOver(root, 'powerhouse'), root);

    // Inject text *before* the passage: text-position now points elsewhere, but
    // the quote should still locate it.
    const intro = document.createElement('p');
    intro.textContent = 'Biology recap follows. ';
    root.insertBefore(intro, root.firstChild);

    expect(resolveAnchor(anchor, root)?.toString()).toBe('powerhouse');
  });

  it('disambiguates repeated text by prefix/suffix context', () => {
    const root = mount(
      '<p>red <span id="a1">apple</span> and green <span id="a2">apple</span></p>',
    );
    const second = root.querySelector('#a2');
    if (!second) throw new Error('missing #a2');
    const range = document.createRange();
    range.selectNodeContents(second);

    const anchor = anchorFromRange(range, root);
    const resolved = resolveAnchor(anchor, root);

    expect(resolved?.toString()).toBe('apple');
    // It must be the *green* apple (offset 20), not the red one (offset 4).
    expect(resolved ? startOffsetOf(root, resolved) : -1).toBe(20);
  });

  it('falls back to text-position when there is no quote', () => {
    const root = mount(SENTENCE);
    const built = anchorFromRange(rangeOver(root, 'powerhouse'), root);
    const positionOnly = { textPosition: built.textPosition };
    expect(resolveAnchor(positionOnly, root)?.toString()).toBe('powerhouse');
  });

  it('returns null when the passage cannot be found', () => {
    const root = mount('<p>nothing to see here</p>');
    expect(resolveAnchor({ quote: { exact: 'absent words' } }, root)).toBeNull();
  });
});
