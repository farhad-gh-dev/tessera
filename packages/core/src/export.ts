import type {
  Document,
  DocumentItem,
  ID,
  ISODateTime,
  Snippet,
  SnippetAnchor,
  SnippetType,
} from './types.js';

/**
 * Document export (PRD §7.6, EXP-1..3). Pure serialization from the reference
 * model — a {@link Document} plus its ordered {@link DocumentItem}s and the
 * {@link Snippet}s they reference — into portable formats. Lives in core so any
 * surface (web today, others later) shares one provenance-preserving renderer,
 * and so it can be unit-tested without a browser.
 *
 * The only format here is **Markdown** (EXP-1): snippets become block quotes
 * carrying a source link + domain + date (EXP-3 provenance), interleaved with
 * the user's own headings and notes. PDF export (EXP-2) is a presentation
 * concern handled by the web app's print view, not a string transform.
 */

/* -------------------------------------------------------------------------- */
/* Deep-link source URLs (shared with LIB-6 / DOC-7)                          */
/* -------------------------------------------------------------------------- */

/**
 * Build a deep link back to a snippet's source. When the anchor carries an exact
 * quote we append a native `#:~:text=` Text Fragment so the browser scrolls to
 * and highlights the passage on its own (and the extension re-highlights on top
 * if installed). Falls back to the bare URL when there's no quote or the URL
 * can't be parsed.
 */
export function buildTextFragmentUrl(url: string, anchor?: SnippetAnchor | null): string {
  const exact = anchor?.quote?.exact?.trim();
  if (!exact) return url;
  try {
    const base = new URL(url);
    base.hash = '';
    return `${base.href}#:~:text=${encodeTextFragment(exact)}`;
  } catch {
    return url;
  }
}

function encodeTextFragment(exact: string): string {
  // Hyphens delimit prefix-/-suffix in the spec, and commas delimit
  // textStart,textEnd — percent-encode both so they're treated literally.
  const enc = (part: string) =>
    encodeURIComponent(part).replace(/-/g, '%2D').replace(/,/g, '%2C');
  const words = exact.split(/\s+/);
  // Long quotes become a textStart,textEnd range to keep the URL sane and robust.
  if (exact.length <= 100 || words.length <= 6) return enc(exact);
  const start = words.slice(0, 5).join(' ');
  const end = words.slice(-5).join(' ');
  return `${enc(start)},${enc(end)}`;
}

/* -------------------------------------------------------------------------- */
/* Markdown export (EXP-1, EXP-3)                                             */
/* -------------------------------------------------------------------------- */

export interface MarkdownExportOptions {
  /**
   * ISO timestamp stamped into the export header ("exported YYYY-MM-DD").
   * Omitted from the header when absent — pass `new Date().toISOString()` to
   * include it; tests pass a fixed value for determinism.
   */
  exportedAt?: ISODateTime;
}

/**
 * Render a document to Markdown (EXP-1). Items are defensively re-filtered
 * (live only) and re-sorted by fractional position, so the output is correct
 * regardless of input ordering. Every referenced snippet carries a source link,
 * domain, and capture date (EXP-3); the user's headings, notes, and per-snippet
 * notes are interleaved in place.
 */
export function documentToMarkdown(
  doc: Pick<Document, 'title' | 'description'>,
  items: readonly DocumentItem[],
  snippetsById: ReadonlyMap<ID, Snippet>,
  options: MarkdownExportOptions = {},
): string {
  const ordered = [...items]
    .filter((i) => i.deletedAt == null)
    .sort((a, b) => a.position.localeCompare(b.position));

  const blocks: string[] = [`# ${oneLine(doc.title) || 'Untitled'}`];

  const description = doc.description?.trim();
  if (description) blocks.push(description);

  const metaParts = [`${ordered.length} ${ordered.length === 1 ? 'item' : 'items'}`];
  const exportedDate = isoDate(options.exportedAt);
  if (exportedDate) metaParts.push(`exported ${exportedDate}`);
  blocks.push(`*${metaParts.join(' · ')} · Tessera*`);
  blocks.push('---');

  for (const item of ordered) {
    const block = itemToMarkdown(item, snippetsById);
    if (block) blocks.push(block);
  }

  return `${blocks.join('\n\n')}\n`;
}

function itemToMarkdown(
  item: DocumentItem,
  snippetsById: ReadonlyMap<ID, Snippet>,
): string | null {
  if (item.kind === 'heading') {
    const content = oneLine(item.content ?? '');
    return content ? `## ${content}` : null;
  }
  if (item.kind === 'text_block') {
    return (item.content ?? '').trim() || null;
  }
  // snippet_ref
  const snippet = item.snippetId ? snippetsById.get(item.snippetId) : undefined;
  if (!snippet) return '> *(This snippet is no longer available.)*';
  return snippetToMarkdown(snippet);
}

function snippetToMarkdown(s: Snippet): string {
  const body =
    s.type === 'text'
      ? s.text && s.text.trim()
        ? quoteLines(s.text.trim())
        : '> *(no text captured)*'
      : `> *[${imageLabel(s.type)}]* ${oneLine(s.pageTitle) || 'image'}`;

  // Attribution lives in the same block quote, set off by an em-dash (EXP-3).
  let md = `${body}\n>\n> — ${attribution(s)}`;

  const note = s.note?.trim();
  if (note) md += `\n\n**Note:** ${oneLine(note)}`;
  return md;
}

/** Source link + domain + capture date for a snippet (EXP-3 provenance). */
function attribution(s: Snippet): string {
  const href = buildTextFragmentUrl(s.url, s.anchor);
  const label = escapeLinkText(oneLine(s.pageTitle) || s.domain || s.url);
  const domain = s.domain ? ` · ${s.domain}` : '';
  const date = isoDate(s.createdAt);
  const saved = date ? ` · saved ${date}` : '';
  // Angle-bracket the destination so parens/special chars in the URL are safe.
  return `[${label}](<${href}>)${domain}${saved}`;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Prefix every line with `> ` (blank lines become a bare `>`) for one block quote. */
function quoteLines(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (line.length ? `> ${line}` : '>'))
    .join('\n');
}

function imageLabel(type: SnippetType): string {
  return type === 'screenshot' ? 'Screenshot' : 'Image';
}

/** Collapse all whitespace (incl. newlines) to single spaces; for one-line contexts. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Escape `[` and `]` so user titles can't break Markdown link syntax. */
function escapeLinkText(text: string): string {
  return text.replace(/[[\]]/g, '\\$&');
}

/** ISO-8601 → `YYYY-MM-DD` (locale-independent, so tests are deterministic). */
function isoDate(iso: string | undefined): string {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '';
}
