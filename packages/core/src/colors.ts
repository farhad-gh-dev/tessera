/**
 * Highlight color palette — the single source of truth for the small fixed set
 * of highlight colors, shared by capture (extension), in-page re-highlight
 * (extension), and the platform's color editor (web). Defined once here so the
 * three surfaces never drift. See Selection & Highlight spec v0.1, CLR-1.
 *
 * `hex` is the solid swatch shown in pickers and the value persisted on
 * `Snippet.color`. `fill` is the translucent paint used in-page by the CSS
 * Custom Highlight API. Arbitrary hex values stored by older snippets still
 * render (see {@link highlightFill}); the palette only constrains new captures.
 */

export interface HighlightColor {
  /** Stable token; also the in-page `::highlight()` group suffix. */
  token: string;
  /** Human label (color-picker aria-label / tooltip). */
  label: string;
  /** Solid swatch + the value stored on `Snippet.color`. */
  hex: string;
  /** Translucent fill for in-page painting. */
  fill: string;
}

const YELLOW: HighlightColor = {
  token: 'yellow',
  label: 'Yellow',
  hex: '#fde68a',
  fill: 'rgba(253, 230, 138, 0.5)',
};

/** The v1 highlight palette. Array order is the picker order; the first is the default. */
export const HIGHLIGHT_COLORS: readonly HighlightColor[] = [
  YELLOW,
  { token: 'green', label: 'Green', hex: '#a7f3d0', fill: 'rgba(167, 243, 208, 0.5)' },
  { token: 'blue', label: 'Blue', hex: '#bfdbfe', fill: 'rgba(191, 219, 254, 0.5)' },
  { token: 'pink', label: 'Pink', hex: '#fbcfe8', fill: 'rgba(251, 207, 232, 0.5)' },
  { token: 'orange', label: 'Orange', hex: '#fed7aa', fill: 'rgba(254, 215, 170, 0.5)' },
];

/** Default highlight color (Yellow) — applied when the user saves without picking one. */
export const DEFAULT_HIGHLIGHT_COLOR: HighlightColor = YELLOW;

/** Look up a palette entry by its stored value (hex) or token; `undefined` if unknown. */
export function highlightColorOf(
  value: string | undefined | null,
): HighlightColor | undefined {
  if (!value) return undefined;
  return HIGHLIGHT_COLORS.find((c) => c.hex === value || c.token === value);
}

/**
 * The translucent fill used to paint a stored color in-page. Known palette colors
 * use their tuned `fill`; an arbitrary `#rrggbb` from an older snippet renders at
 * ~50% alpha; anything unrecognized (incl. `undefined`) falls back to the default.
 */
export function highlightFill(value: string | undefined | null): string {
  const known = highlightColorOf(value);
  if (known) return known.fill;
  if (value && /^#[0-9a-fA-F]{6}$/.test(value)) {
    const r = parseInt(value.slice(1, 3), 16);
    const g = parseInt(value.slice(3, 5), 16);
    const b = parseInt(value.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, 0.5)`;
  }
  return DEFAULT_HIGHLIGHT_COLOR.fill;
}

/**
 * A stable in-page highlight group key for a stored color: the palette token, or
 * a sanitized `hex-rrggbb` for arbitrary colors, or the default token otherwise.
 * (One CSS Custom Highlight group is registered per distinct key.)
 */
export function highlightGroupKey(value: string | undefined | null): string {
  const known = highlightColorOf(value);
  if (known) return known.token;
  if (value && /^#[0-9a-fA-F]{6}$/.test(value)) return `hex-${value.slice(1).toLowerCase()}`;
  return DEFAULT_HIGHLIGHT_COLOR.token;
}
