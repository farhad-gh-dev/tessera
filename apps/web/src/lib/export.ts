import {
  documentToMarkdown,
  type Document,
  type DocumentItem,
  type Snippet,
} from '@tessera/core';

/**
 * Client glue for document export (EXP-1). The Markdown itself is rendered by
 * the pure `documentToMarkdown` in `@tessera/core`; here we just stamp the
 * export time and trigger a browser download. PDF export (EXP-2) is the print
 * view at `/documents/[id]/print`, not a transform, so it isn't here.
 */

/** Render a document to Markdown, stamped with the current export time. */
export function documentMarkdown(
  doc: Pick<Document, 'title' | 'description'>,
  items: readonly DocumentItem[],
  snippetsById: ReadonlyMap<string, Snippet>,
): string {
  return documentToMarkdown(doc, items, snippetsById, {
    exportedAt: new Date().toISOString(),
  });
}

/** Build + download a document's Markdown as `<slug>.md` (EXP-1). */
export function downloadDocumentMarkdown(
  doc: Pick<Document, 'title' | 'description'>,
  items: readonly DocumentItem[],
  snippetsById: ReadonlyMap<string, Snippet>,
): void {
  const markdown = documentMarkdown(doc, items, snippetsById);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugifyFilename(doc.title)}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** A safe, lowercase, dash-separated file stem from a document title. */
export function slugifyFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'document';
}
