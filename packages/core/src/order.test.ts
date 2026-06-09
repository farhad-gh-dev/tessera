import { describe, expect, it } from 'vitest';
import { keyAfter, keyBefore, keyBetween } from './order.js';

/** Keys are decimal-fraction strings, so a plain string sort is the source of truth. */
const sorted = (keys: string[]) => [...keys].sort();

describe('keyBetween', () => {
  it('seeds a first key when both bounds are open', () => {
    const k = keyBetween(null, null);
    expect(k).toMatch(/^\d+$/);
  });

  it('produces a key strictly between two neighbours', () => {
    const mid = keyBetween('1', '2');
    expect('1' < mid && mid < '2').toBe(true);
  });

  it('appends after and prepends before', () => {
    const first = keyBetween(null, null);
    expect(keyBefore(first) < first).toBe(true);
    expect(first < keyAfter(first)).toBe(true);
  });

  it('keeps lexicographic and numeric order in agreement (no trailing zeros)', () => {
    // Adjacent keys with no room at the current width must widen, never tie.
    const a = keyBetween(null, null); // e.g. "5"
    const b = keyBetween(a, keyAfter(a));
    expect(a < b && b < keyAfter(a)).toBe(true);
    expect(b.endsWith('0')).toBe(false);
  });

  it('rejects a reversed or equal range', () => {
    expect(() => keyBetween('5', '5')).toThrow();
    expect(() => keyBetween('7', '3')).toThrow();
  });

  it('rejects malformed keys', () => {
    expect(() => keyBetween('a', null)).toThrow();
  });

  it('survives many inserts at the head, tail, and a hot middle gap', () => {
    // Three adversarial patterns that stress fractional indexing: always
    // prepend, always append, and always split the same gap.
    for (const where of ['head', 'tail', 'middle'] as const) {
      const keys = [keyBetween(null, null)];
      for (let i = 0; i < 200; i++) {
        if (where === 'head') {
          keys.unshift(keyBefore(keys[0]!));
        } else if (where === 'tail') {
          keys.push(keyAfter(keys[keys.length - 1]!));
        } else {
          keys.splice(1, 0, keyBetween(keys[0]!, keys[1] ?? null));
        }
      }
      expect(keys).toEqual(sorted(keys)); // still ascending
      expect(new Set(keys).size).toBe(keys.length); // all distinct
    }
  });

  it('keeps a list ordered through random insertions', () => {
    const keys: string[] = [];
    for (let i = 0; i < 500; i++) {
      const at = Math.floor(Math.random() * (keys.length + 1));
      const left = at > 0 ? keys[at - 1]! : null;
      const right = at < keys.length ? keys[at]! : null;
      keys.splice(at, 0, keyBetween(left, right));
    }
    expect(keys).toEqual(sorted(keys));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
