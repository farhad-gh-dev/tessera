/**
 * Selection serialization (CAP-3, block/section capture).
 *
 * Turn the cloned contents of a DOM selection into two faithful renderings of
 * the same passage:
 *
 *   - **`html`** — lightly-sanitized *structural* HTML that preserves both block
 *     structure (headings, paragraphs, lists, blockquotes, line breaks) and
 *     inline emphasis (bold/italic/code/…). This is the display source of truth.
 *   - **`text`** — a structure-aware plain-text rendering (newlines between
 *     blocks, `• ` before list items). The portable fallback used for editing,
 *     search, and Markdown export, and what older/structure-free captures use.
 *
 * SECURITY — this is an *allowlist* serializer, and that allowlist is the trust
 * boundary for everything that later injects `html` (see `RichText`). It walks
 * the DOM and emits only a fixed, closed set of tags, and **never copies any
 * attribute**. So the output can carry no `script`/`style`/`iframe`, no event
 * handlers (`onerror=…`), no URLs (`href`/`src`), and no inline styles — it is
 * safe to render via `innerHTML` / `dangerouslySetInnerHTML`. Unknown elements
 * are unwrapped (their text is kept); `<script>`/`<style>`/etc. are dropped
 * whole. Built fresh for Tessera — no external sanitizer dependency.
 */

/** Inline emphasis tags we keep, normalized to a canonical name. */
const INLINE_TAGS: Record<string, string> = {
  B: 'strong',
  STRONG: 'strong',
  I: 'em',
  EM: 'em',
  U: 'u',
  MARK: 'mark',
  CODE: 'code',
  SUB: 'sub',
  SUP: 'sup',
};

/** Block tags we keep verbatim (heading levels preserved as-is). */
const BLOCK_TAGS = new Set([
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'PRE',
]);

/**
 * Generic containers that imply a block break but whose own tag we don't keep.
 * When such a wrapper holds only inline content we promote it to a paragraph;
 * when it already holds block children we just unwrap it.
 */
const GENERIC_BLOCKS = new Set([
  'DIV',
  'SECTION',
  'ARTICLE',
  'HEADER',
  'FOOTER',
  'MAIN',
  'ASIDE',
  'FIGURE',
  'FIGCAPTION',
  'DL',
  'DT',
  'DD',
  'TABLE',
  'THEAD',
  'TBODY',
  'TFOOT',
  'TR',
]);

/** Tags whose entire subtree is dropped — neither tag nor text survives. */
const DROP_WHOLE_TAGS = [
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'IFRAME',
  'SVG',
  'CANVAS',
  'OBJECT',
  'EMBED',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'BUTTON',
] as const;
const DROP_WHOLE = new Set<string>(DROP_WHOLE_TAGS);

/**
 * Lowercased comma selector matching elements whose whole subtree the serializer
 * drops. The capture content script uses it to enumerate the *same* images this
 * serializer keeps, so its live-DOM image order lines up 1:1 with the
 * `<img data-tsr-img="N">` tokens emitted here (IMG-3/5).
 */
export const DROP_WHOLE_ANCESTOR_SELECTOR = DROP_WHOLE_TAGS.map((t) =>
  t.toLowerCase(),
).join(',');

/** True only when the serialized HTML actually carries markup worth keeping. */
const MARKUP_RE = /<(?:h[1-6]|p|ul|ol|li|blockquote|pre|br|img|strong|em|u|mark|code|sub|sup)\b/i;

interface Walked {
  html: string;
  text: string;
  /** Whether this subtree produced any block-level element. */
  hasBlock: boolean;
}

/**
 * Serialize the contents of `node` (typically a `Range.cloneContents()`
 * fragment) to structural `html` + structure-aware `text`. `html` is `''` when
 * the selection has no structure or emphasis beyond plain text — callers then
 * store only `text` (and re-display falls back to it).
 *
 * When `opts.images` is set, inline `<img>` elements are emitted as
 * **attribute-free tokens** (`<img data-tsr-img="N">`, `N` in document order)
 * for a caller that resolves / filters / uploads them out-of-band (IMG-5); the
 * page's `src`/handlers are never copied. Default: images are dropped (v0.3).
 */
export function serializeSelection(
  node: Node,
  opts?: { images?: boolean },
): { html: string; text: string } {
  const walked = walk(node, { imgCount: 0, images: opts?.images ?? false });
  const html = walked.html.trim();
  return {
    html: MARKUP_RE.test(html) ? html : '',
    text: normalizeText(walked.text),
  };
}

function walk(node: Node, ctx: { imgCount: number; images: boolean }): Walked {
  let html = '';
  let text = '';
  let hasBlock = false;

  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3 /* TEXT_NODE */) {
      const data = child.textContent ?? '';
      html += escapeText(data);
      text += data;
      continue;
    }
    if (child.nodeType !== 1 /* ELEMENT_NODE */) continue;

    const el = child as Element;
    const tag = el.tagName.toUpperCase();

    if (DROP_WHOLE.has(tag)) continue;
    if (tag === 'BR') {
      html += '<br>';
      text += '\n';
      continue;
    }
    if (tag === 'IMG') {
      // Inline image (IMG-1/5). Only when the caller opts in, and even then we
      // emit a Tessera-controlled token carrying NO page attribute — never the
      // page's `src`/`onerror`/etc. The content script resolves each image
      // against the live DOM, filters non-content ones, uploads the bytes, then
      // rewrites or drops this token by its index (document order). An image
      // contributes no plain text.
      if (ctx.images) {
        html += `<img data-tsr-img="${ctx.imgCount}">`;
        ctx.imgCount += 1;
      }
      continue;
    }

    const inner = walk(el, ctx);
    const inlineTag = INLINE_TAGS[tag];

    if (inlineTag) {
      if (inner.html) html += `<${inlineTag}>${inner.html}</${inlineTag}>`;
      text += inner.text;
      if (inner.hasBlock) hasBlock = true;
      continue;
    }

    if (BLOCK_TAGS.has(tag)) {
      const name = tag.toLowerCase();
      html += `<${name}>${inner.html}</${name}>`;
      text += blockText(tag, inner.text);
      hasBlock = true;
      continue;
    }

    if (GENERIC_BLOCKS.has(tag)) {
      if (inner.hasBlock) {
        html += inner.html; // children carry their own blocks; just unwrap
        text += inner.text;
      } else if (inner.html.trim()) {
        html += `<p>${inner.html}</p>`; // inline-only wrapper → a paragraph
        text += `\n${inner.text.trim()}\n`;
      }
      hasBlock = true;
      continue;
    }

    // Inline-ish or unknown wrapper (span, a, label, small, time, abbr, font…):
    // drop the wrapper and its attributes, keep the content.
    html += inner.html;
    text += inner.text;
    if (inner.hasBlock) hasBlock = true;
  }

  return { html, text, hasBlock };
}

/** Plain-text rendering of a kept block: list items get a bullet; others break. */
function blockText(tag: string, inner: string): string {
  const trimmed = inner.trim();
  if (!trimmed) return '';
  if (tag === 'LI') return `\n• ${trimmed}`;
  if (tag === 'UL' || tag === 'OL') return `\n${trimmed}\n`;
  return `\n${trimmed}\n`;
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Collapse intra-line whitespace and fold block boundaries into single line
 * breaks — one newline between blocks (and list items), never blank lines — so
 * the plain-text rendering stays compact and predictable.
 */
function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Inline images (IMG-*) — token helpers shared by capture, render, cleanup.  */
/* -------------------------------------------------------------------------- */

/** Attribute the serializer stamps on each inline-image token. */
export const INLINE_IMG_ATTR = 'data-tsr-img';

/**
 * Substitute resolved signed URLs into a passage's inline-image tokens, returning
 * html ready to inject. Each `<img data-tsr-img="PATH">` becomes an `<img src>`
 * once its PATH resolves (the URL is HTML-escaped — it is an app-minted Storage
 * signed URL, never page content); a still-uploading (numeric) token or an
 * as-yet-unsigned path renders a sized skeleton placeholder.
 *
 * State-driven by design: the resolved `src` lives in the React-owned markup
 * rather than being set imperatively, so it survives re-renders and re-signs
 * cleanly once the caller's session is ready. The surrounding structural markup
 * is already serializer-sanitized (IMG-5), and the only URLs introduced here are
 * ones the app minted from its own Storage — no page-supplied URL is ever
 * injected.
 */
export function applyInlineImageUrls(html: string, urls: Map<string, string>): string {
  return html.replace(
    new RegExp(`<img ${INLINE_IMG_ATTR}="([^"]+)">`, 'g'),
    (_match, ref: string) => {
      const url = /^\d+$/.test(ref) ? undefined : urls.get(ref);
      if (url) {
        return `<img src="${escapeAttr(url)}" alt="" loading="lazy" style="max-width:100%;height:auto;border-radius:6px" />`;
      }
      return `<span class="tsr-inline-pending" style="display:block;min-height:1.5rem;border-radius:6px;background:rgba(148,163,184,0.15)"></span>`;
    },
  );
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * The `snippet-images` Storage paths of a passage's inline images, for cleanup
 * when its snippet is deleted (IMG-8). Pending (numeric) tokens have no object
 * yet and are skipped.
 */
export function inlineImagePaths(html: string | undefined | null): string[] {
  if (!html) return [];
  const paths: string[] = [];
  const re = new RegExp(`<img ${INLINE_IMG_ATTR}="([^"]+)">`, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const ref = match[1];
    if (ref && !/^\d+$/.test(ref)) paths.push(ref);
  }
  return paths;
}
