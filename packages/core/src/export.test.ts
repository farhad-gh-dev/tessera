import { describe, expect, it } from 'vitest';
import { buildTextFragmentUrl, documentToMarkdown } from './export.js';
import type { Document, DocumentItem, Snippet } from './types.js';

/* -------------------------------------------------------------------------- */
/* Factories                                                                  */
/* -------------------------------------------------------------------------- */

const sync = (over: Partial<Snippet> = {}) => ({
  userId: 'u1',
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
  ...over,
});

function snippet(over: Partial<Snippet> = {}): Snippet {
  return {
    id: 's1',
    type: 'text',
    text: 'Mitochondria are the powerhouse of the cell.',
    url: 'https://en.wikipedia.org/wiki/Cell',
    domain: 'en.wikipedia.org',
    pageTitle: 'Cell — Wikipedia',
    ...sync(),
    ...over,
  } as Snippet;
}

function item(over: Partial<DocumentItem>): DocumentItem {
  return {
    id: 'i1',
    documentId: 'd1',
    position: 'a0',
    kind: 'snippet_ref',
    ...sync(),
    ...over,
  } as DocumentItem;
}

const doc: Pick<Document, 'title' | 'description'> = {
  title: 'Cell Biology — Midterm',
  description: 'Key passages for the exam.',
};

/* -------------------------------------------------------------------------- */
/* buildTextFragmentUrl                                                       */
/* -------------------------------------------------------------------------- */

describe('buildTextFragmentUrl', () => {
  it('returns the bare URL when there is no quote', () => {
    expect(buildTextFragmentUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(
      buildTextFragmentUrl('https://example.com/a', { quote: { exact: '  ' } }),
    ).toBe('https://example.com/a');
  });

  it('appends an encoded text fragment for a short quote', () => {
    const url = buildTextFragmentUrl('https://example.com/a', {
      quote: { exact: 'hello world' },
    });
    expect(url).toBe('https://example.com/a#:~:text=hello%20world');
  });

  it('encodes hyphens and commas so the fragment grammar stays literal', () => {
    const url = buildTextFragmentUrl('https://example.com/a', {
      quote: { exact: 'a-b, c' },
    });
    expect(url).toContain('#:~:text=');
    expect(url).toContain('%2D');
    expect(url).toContain('%2C');
  });

  it('uses a textStart,textEnd range for a long quote', () => {
    const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    const url = buildTextFragmentUrl('https://example.com/a', { quote: { exact: long } });
    expect(url).toContain('#:~:text=');
    expect(url).toContain(','); // start,end range delimiter
    expect(url).toContain('word0');
    expect(url).toContain('word29');
  });

  it('falls back to the input when the URL is unparseable', () => {
    expect(buildTextFragmentUrl('not a url', { quote: { exact: 'x' } })).toBe(
      'not a url',
    );
  });
});

/* -------------------------------------------------------------------------- */
/* documentToMarkdown                                                         */
/* -------------------------------------------------------------------------- */

describe('documentToMarkdown', () => {
  const opts = { exportedAt: '2026-06-09T12:00:00.000Z' };

  it('renders a title, description, item-count meta, and a thematic break', () => {
    const md = documentToMarkdown(doc, [], new Map(), opts);
    expect(md).toContain('# Cell Biology — Midterm');
    expect(md).toContain('Key passages for the exam.');
    expect(md).toContain('*0 items · exported 2026-06-09 · Tessera*');
    expect(md).toContain('\n---\n');
  });

  it('quotes a text snippet with a deep-link source, domain, and saved date (EXP-3)', () => {
    const s = snippet({ anchor: { quote: { exact: 'powerhouse of the cell' } } });
    const md = documentToMarkdown(
      doc,
      [item({ snippetId: s.id })],
      new Map([[s.id, s]]),
      opts,
    );
    expect(md).toContain('> Mitochondria are the powerhouse of the cell.');
    expect(md).toContain(
      '> — [Cell — Wikipedia](<https://en.wikipedia.org/wiki/Cell#:~:text=',
    );
    expect(md).toContain('· en.wikipedia.org · saved 2026-06-01');
  });

  it('renders a per-snippet note beneath the quote (NOTE-1)', () => {
    const s = snippet({ note: 'Comes up every year.' });
    const md = documentToMarkdown(
      doc,
      [item({ snippetId: s.id })],
      new Map([[s.id, s]]),
      opts,
    );
    expect(md).toContain('**Note:** Comes up every year.');
  });

  it('labels image/screenshot snippets instead of quoting empty text', () => {
    const img = snippet({
      id: 's2',
      type: 'screenshot',
      text: '',
      pageTitle: 'Diagram page',
    });
    const md = documentToMarkdown(
      doc,
      [item({ id: 'i2', snippetId: img.id })],
      new Map([[img.id, img]]),
      opts,
    );
    expect(md).toContain('> *[Screenshot]* Diagram page');
  });

  it('interleaves headings and text blocks, skipping empty ones', () => {
    const items = [
      item({
        id: 'h1',
        kind: 'heading',
        content: 'Energy',
        position: 'a0',
        snippetId: null,
      }),
      item({
        id: 't1',
        kind: 'text_block',
        content: 'Why this matters.',
        position: 'a1',
        snippetId: null,
      }),
      item({
        id: 'h2',
        kind: 'heading',
        content: '   ',
        position: 'a2',
        snippetId: null,
      }),
    ];
    const md = documentToMarkdown(doc, items, new Map(), opts);
    expect(md).toContain('## Energy');
    expect(md).toContain('Why this matters.');
    expect(md).not.toContain('## \n');
  });

  it('emits a placeholder for a referenced snippet that is missing', () => {
    const md = documentToMarkdown(doc, [item({ snippetId: 'gone' })], new Map(), opts);
    expect(md).toContain('*(This snippet is no longer available.)*');
  });

  it('orders items by fractional position regardless of input order', () => {
    const items = [
      item({
        id: 'b',
        kind: 'heading',
        content: 'Second',
        position: 'a2',
        snippetId: null,
      }),
      item({
        id: 'a',
        kind: 'heading',
        content: 'First',
        position: 'a1',
        snippetId: null,
      }),
    ];
    const md = documentToMarkdown(doc, items, new Map(), opts);
    expect(md.indexOf('## First')).toBeLessThan(md.indexOf('## Second'));
  });

  it('ignores tombstoned items', () => {
    const items = [
      item({ id: 'live', kind: 'heading', content: 'Live', snippetId: null }),
      item({
        id: 'dead',
        kind: 'heading',
        content: 'Dead',
        position: 'a1',
        snippetId: null,
        deletedAt: '2026-06-05T00:00:00.000Z',
      }),
    ];
    const md = documentToMarkdown(doc, items, new Map(), opts);
    expect(md).toContain('## Live');
    expect(md).not.toContain('## Dead');
  });
});
