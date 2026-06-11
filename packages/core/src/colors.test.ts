import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HIGHLIGHT_COLOR,
  HIGHLIGHT_COLORS,
  highlightColorOf,
  highlightFill,
  highlightGroupKey,
} from './colors.js';

describe('highlight palette', () => {
  it('has five colors with unique tokens and hexes', () => {
    expect(HIGHLIGHT_COLORS).toHaveLength(5);
    expect(new Set(HIGHLIGHT_COLORS.map((c) => c.token)).size).toBe(5);
    expect(new Set(HIGHLIGHT_COLORS.map((c) => c.hex)).size).toBe(5);
  });

  it('defaults to yellow, and the default is a member of the palette', () => {
    expect(DEFAULT_HIGHLIGHT_COLOR.token).toBe('yellow');
    expect(HIGHLIGHT_COLORS).toContain(DEFAULT_HIGHLIGHT_COLOR);
  });
});

describe('highlightColorOf', () => {
  it('looks up by hex or token, undefined when unknown', () => {
    expect(highlightColorOf('#fde68a')?.token).toBe('yellow');
    expect(highlightColorOf('green')?.hex).toBe('#a7f3d0');
    expect(highlightColorOf('not-a-color')).toBeUndefined();
    expect(highlightColorOf(undefined)).toBeUndefined();
  });
});

describe('highlightFill', () => {
  it('uses the tuned fill for palette colors', () => {
    expect(highlightFill('#fde68a')).toBe(DEFAULT_HIGHLIGHT_COLOR.fill);
  });

  it('renders an arbitrary #rrggbb at half alpha', () => {
    expect(highlightFill('#123456')).toBe('rgba(18, 52, 86, 0.5)');
  });

  it('falls back to the default fill for unknown / missing values', () => {
    expect(highlightFill(undefined)).toBe(DEFAULT_HIGHLIGHT_COLOR.fill);
    expect(highlightFill('rebeccapurple')).toBe(DEFAULT_HIGHLIGHT_COLOR.fill);
  });
});

describe('highlightGroupKey', () => {
  it('keys palette colors by token and arbitrary hexes stably', () => {
    expect(highlightGroupKey('#fde68a')).toBe('yellow');
    expect(highlightGroupKey('#123456')).toBe('hex-123456');
    expect(highlightGroupKey(undefined)).toBe('yellow');
  });
});
