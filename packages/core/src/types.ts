/**
 * Tessera shared domain types.
 *
 * These mirror the Postgres tables in `supabase/migrations/` and the local
 * IndexedDB mirror. Every synced row carries {@link SyncFields} so the sync
 * engine can reconcile across devices with last-write-wins + tombstones.
 *
 * Data model rationale: the **reference model** — a Snippet exists once and is
 * always grouped by its source website; Documents merely *reference* snippets
 * (one snippet may appear in many documents). See PRD §5.
 */

/** A UUID string. */
export type ID = string;

/** ISO-8601 timestamp, e.g. `"2026-06-07T15:04:05.000Z"`. */
export type ISODateTime = string;

/** Fields present on every synced record. */
export interface SyncFields {
  id: ID;
  userId: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Soft-delete tombstone; `null`/`undefined` means the record is live. */
  deletedAt?: ISODateTime | null;
}

/* -------------------------------------------------------------------------- */
/* Snippets                                                                   */
/* -------------------------------------------------------------------------- */

export type SnippetType = 'text' | 'image' | 'screenshot';

/**
 * A robust, multi-strategy anchor that lets us re-locate (and re-highlight) a
 * saved passage on its original page even after minor edits. Strategies are
 * tried in order of precision; any subset may be present.
 */
export interface SnippetAnchor {
  /** Exact quote plus a little surrounding context (W3C "text quote" style). */
  quote?: { exact: string; prefix?: string; suffix?: string };
  /** Character offsets within the page's text content (fallback). */
  textPosition?: { start: number; end: number };
  /** A CSS/XPath-like selector for the containing element (last resort). */
  selector?: string;
}

/** A single saved highlight: text, an image, or a screenshot region. */
export interface Snippet extends SyncFields {
  type: SnippetType;
  /** Selected text (for `text`; may be empty for image/screenshot). */
  text?: string;
  /**
   * Lightly-sanitized HTML preserving the passage's structure — headings,
   * paragraphs, lists, blockquotes, line breaks, and inline emphasis. Produced
   * solely by `serializeSelection` (an allowlist serializer that copies no
   * attributes), so it is safe to render. Absent when the selection had no
   * structure beyond plain text; re-display then falls back to {@link text}.
   */
  html?: string;
  /** Storage path/key for a saved image or screenshot clip. */
  imagePath?: string;
  /** Source page URL. */
  url: string;
  /** Host of {@link url}; the default "website" grouping key. */
  domain: string;
  pageTitle: string;
  faviconUrl?: string;
  /** Deep-link anchor back to the exact passage on the page. */
  anchor?: SnippetAnchor;
  /** Highlight color (design token or hex). */
  color?: string;
  /** The user's personal note; travels with the snippet everywhere. */
  note?: string;
  /** Set once the captured text has been hand-edited on the platform (NOTE-3). */
  edited?: boolean | null;
}

/* -------------------------------------------------------------------------- */
/* Tags                                                                       */
/* -------------------------------------------------------------------------- */

export interface Tag extends SyncFields {
  name: string;
}

/** Join row linking a Snippet to a Tag. */
export interface SnippetTag extends SyncFields {
  snippetId: ID;
  tagId: ID;
}

/* -------------------------------------------------------------------------- */
/* Documents (reference model)                                                */
/* -------------------------------------------------------------------------- */

export interface Document extends SyncFields {
  title: string;
  description?: string;
}

export type DocumentItemKind = 'snippet_ref' | 'heading' | 'text_block';

/**
 * One ordered entry in a Document. A `snippet_ref` points at a Snippet (the
 * same snippet may be referenced by many documents); `heading` / `text_block`
 * carry the user's own authored content interleaved between references.
 */
export interface DocumentItem extends SyncFields {
  documentId: ID;
  /** Fractional index (`"a0"`, `"a1"`, …) for cheap reordering. */
  position: string;
  kind: DocumentItemKind;
  /** Set when `kind === 'snippet_ref'`. */
  snippetId?: ID | null;
  /** Set for `heading` | `text_block`. */
  content?: string | null;
}

/* -------------------------------------------------------------------------- */
/* AI                                                                         */
/* -------------------------------------------------------------------------- */

export type AiProvider = 'anthropic' | 'openai' | 'google' | 'openrouter';

/** Per-user preferences, including the user-selected default AI model. */
export interface UserSettings {
  userId: ID;
  defaultProvider?: AiProvider;
  defaultModel?: string;
  prefs: Record<string, unknown>;
  updatedAt: ISODateTime;
}

/**
 * A bring-your-own-key credential. The plaintext key is encrypted server-side;
 * `keyCiphertext` is never returned to the client in the clear.
 */
export interface ProviderKey extends SyncFields {
  provider: AiProvider;
  keyCiphertext: string;
  label?: string;
}

export type AiArtifactType = 'summary' | 'flashcards' | 'quiz';
export type AiArtifactScope = 'document' | 'website';

/** A cached AI generation (summary / flashcards / quiz) over saved material. */
export interface AiArtifact extends SyncFields {
  scope: AiArtifactScope;
  /** Document id or domain, depending on {@link scope}. */
  scopeRef: string;
  type: AiArtifactType;
  /** Generated payload; shape depends on {@link type}. */
  content: unknown;
  /** Model that produced it, for provenance. */
  model?: string;
}

export interface Flashcard extends SyncFields {
  documentId?: ID | null;
  front: string;
  back: string;
  sourceSnippetId?: ID | null;
  /** Lightweight spaced-repetition state. */
  srsState: Record<string, unknown>;
}

/**
 * Vector embedding for a snippet. A single fixed embedding model is used across
 * the whole library so the vector index stays coherent regardless of which chat
 * model the user selects (PRD AI-9).
 */
export interface SnippetEmbedding {
  snippetId: ID;
  embedding: number[];
  model: string;
  updatedAt: ISODateTime;
}

/* -------------------------------------------------------------------------- */
/* Derived groupings (computed, not stored)                                   */
/* -------------------------------------------------------------------------- */

/** A by-website grouping computed from snippets. */
export interface WebsiteGroup {
  domain: string;
  title?: string;
  faviconUrl?: string;
  snippetCount: number;
}
