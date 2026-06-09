/**
 * Fractional indexing — cheap, sync-friendly ordering for document items.
 *
 * A position is a string of decimal digits read as the fraction `0.<key>`.
 * {@link keyBetween} returns a key that sorts strictly between two neighbours
 * both **lexicographically** (how Postgres + Dexie order `document_items` by the
 * `position` text column) and **numerically** — so a reorder only rewrites the
 * one item that moved, never its neighbours, and two devices inserting at once
 * still converge under last-write-wins.
 *
 * Keys are kept free of trailing zeros, which is exactly what makes lexicographic
 * string order agree with numeric fraction order (`"5"` and `"500"` are equal as
 * numbers but not as strings; never emitting trailing zeros rules that case out).
 */

const RADIX = 10n;

/** Read a key as a `len`-digit scaled integer (`"5"`, len 3 → `500`). */
function toScaledInt(key: string, len: number): bigint {
  if (key === '') return 0n;
  return BigInt(key.padEnd(len, '0'));
}

/** Drop trailing zeros, never returning an empty string. */
function trimTrailingZeros(s: string): string {
  let end = s.length;
  while (end > 1 && s[end - 1] === '0') end--;
  return s.slice(0, end);
}

const DIGITS = /^\d+$/;

/**
 * A key that sorts strictly between `a` and `b`. `a == null` means "before
 * everything", `b == null` means "after everything". Throws if `a` is not before
 * `b`. The result never has trailing zeros, so string and numeric order agree.
 */
export function keyBetween(a: string | null, b: string | null): string {
  if (a != null && !DIGITS.test(a)) throw new Error(`keyBetween: invalid key ${JSON.stringify(a)}`);
  if (b != null && !DIGITS.test(b)) throw new Error(`keyBetween: invalid key ${JSON.stringify(b)}`);
  if (a != null && b != null && a >= b) {
    throw new Error(`keyBetween: ${a} is not before ${b}`);
  }

  const lo = a ?? '';
  // Start with one digit of headroom past the longer bound and widen until a
  // strict midpoint exists (adjacent integers leave no room at the current width).
  let len = Math.max(lo.length, b?.length ?? 0) + 1;
  for (;;) {
    const loInt = toScaledInt(lo, len);
    const hiInt = b == null ? RADIX ** BigInt(len) : toScaledInt(b, len);
    const mid = (loInt + hiInt) / 2n; // floor
    if (mid > loInt && (b == null || mid < hiInt)) {
      return trimTrailingZeros(mid.toString().padStart(len, '0'));
    }
    len++;
  }
}

/** A key that sorts after `a` (append to the end). */
export function keyAfter(a: string | null): string {
  return keyBetween(a, null);
}

/** A key that sorts before `b` (prepend to the start). */
export function keyBefore(b: string | null): string {
  return keyBetween(null, b);
}
