import {
  HIGHLIGHT_COLORS,
  highlightColorOf,
  highlightFill,
  relativeTime,
  typeLabel,
  type Snippet,
} from '@tessera/core';
import { useSignedImageUrl } from '../shared/image';
import { RichText } from '../shared/rich-text';

interface SnippetCardProps {
  snippet: Snippet;
  /** Show the full text + note (This-page view) rather than clamping (Recent). */
  expanded: boolean;
  confirming: boolean;
  recoloring: boolean;
  onOpenSource: () => void;
  onOpenWeb: () => void;
  onToggleRecolor: () => void;
  onRecolor: (hex: string) => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

/**
 * One capture in the panel's list: source (favicon + domain + saved time), a
 * preview (text or image thumbnail) accented by the highlight color, and the
 * per-item actions — open source, open in web app, recolor, delete (SP-5). All
 * actions have accessible names (A11Y-2).
 */
export function SnippetCard(props: SnippetCardProps) {
  const { snippet: s } = props;
  const accent = highlightFill(s.color);

  return (
    <li
      className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-700 shadow-sm"
      style={{ borderLeftWidth: 3, borderLeftColor: accent }}
    >
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Favicon url={s.faviconUrl} />
        <span className="min-w-0 flex-1 truncate" title={s.url}>
          {s.domain || 'unknown source'}
        </span>
        <time className="shrink-0" dateTime={s.createdAt} title={s.createdAt}>
          {relativeTime(s.createdAt)}
        </time>
      </div>

      <div className="mt-1.5">
        {s.type === 'text' ? (
          <RichText snippet={s} className={props.expanded ? '' : 'line-clamp-4'} />
        ) : (
          <ImagePreview snippet={s} />
        )}
      </div>

      {s.note && s.note.trim() && (
        <div className="mt-1 flex items-start gap-1.5">
          {/* Tree connector (└) tying the note to its highlight — an annotation, not a callout. */}
          <span
            aria-hidden="true"
            className="ml-1 mt-0.5 h-3 w-3 shrink-0 rounded-bl border-b-2 border-l-2 border-slate-300"
          />
          <p
            className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-xs text-slate-600${
              props.expanded ? '' : ' line-clamp-3'
            }`}
          >
            {s.note}
          </p>
        </div>
      )}

      {s.pageTitle && s.pageTitle !== s.domain && (
        <p className="mt-1 truncate text-xs text-slate-400" title={s.pageTitle}>
          {s.pageTitle}
        </p>
      )}

      <div className="mt-2 flex items-center gap-0.5">
        <IconButton label="Open source" title="Open source in a new tab" onClick={props.onOpenSource}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
            <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
          </svg>
        </IconButton>
        <IconButton label="Open in web app" title="Open in the Tessera web app" onClick={props.onOpenWeb}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M10 3.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM2 10a8 8 0 1116 0 8 8 0 01-16 0z" />
            <path d="M10 2a.75.75 0 01.75.75v14.5a.75.75 0 01-1.5 0V2.75A.75.75 0 0110 2z" />
            <path d="M2.75 10.75a.75.75 0 010-1.5h14.5a.75.75 0 010 1.5H2.75z" />
          </svg>
        </IconButton>
        <IconButton
          label="Recolor"
          title="Change highlight color"
          onClick={props.onToggleRecolor}
          active={props.recoloring}
        >
          <span
            className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/10"
            style={{ background: highlightColorOf(s.color)?.hex ?? accent }}
          />
        </IconButton>

        <div className="flex-1" />

        {props.confirming ? (
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={props.onConfirmDelete}
              className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white hover:bg-red-700"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={props.onCancelDelete}
              className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </span>
        ) : (
          <IconButton label="Delete snippet" title="Delete" onClick={props.onAskDelete} danger>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.583.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482 41.03 41.03 0 0 0-2.365-.298V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                clipRule="evenodd"
              />
            </svg>
          </IconButton>
        )}
      </div>

      {props.recoloring && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.token}
              type="button"
              aria-label={c.label}
              title={c.label}
              onClick={() => props.onRecolor(c.hex)}
              className="h-5 w-5 rounded-full ring-1 ring-inset ring-black/10 transition-transform hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100"
              style={{
                background: c.hex,
                outline: s.color === c.hex ? '2px solid #4f46e5' : undefined,
                outlineOffset: 1,
              }}
            />
          ))}
        </div>
      )}
    </li>
  );
}

function ImagePreview({ snippet }: { snippet: Snippet }) {
  const url = useSignedImageUrl(snippet.imagePath);
  if (url) {
    return (
      <img
        src={url}
        alt={`${typeLabel(snippet.type)} from ${snippet.domain}`}
        className="max-h-40 w-full rounded border border-slate-100 object-contain"
      />
    );
  }
  return <p className="italic text-slate-400">{typeLabel(snippet.type)}</p>;
}

function Favicon({ url }: { url?: string }) {
  if (url) {
    return <img src={url} alt="" className="h-3.5 w-3.5 shrink-0 rounded-sm" aria-hidden="true" />;
  }
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.94 6.94a.75.75 0 11-1.06-1.06 5.5 5.5 0 014.243 9.193.75.75 0 01-1.06-1.06A4 4 0 008.94 6.94z"
        clipRule="evenodd"
      />
    </svg>
  );
}

interface IconButtonProps {
  label: string;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  active?: boolean;
}

function IconButton(props: IconButtonProps) {
  const tone = props.danger
    ? 'text-slate-400 hover:bg-red-50 hover:text-red-600'
    : props.active
      ? 'bg-indigo-50 text-indigo-600'
      : 'text-slate-400 hover:bg-indigo-50 hover:text-indigo-600';
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.title}
      onClick={props.onClick}
      className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${tone}`}
    >
      {props.children}
    </button>
  );
}
