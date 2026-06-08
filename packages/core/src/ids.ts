/**
 * Native id generation — no `uuid` dependency (matches the prototype's
 * lean approach). Uses the platform `crypto` where available.
 */

interface CryptoLike {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

function getCrypto(): CryptoLike | undefined {
  return (globalThis as { crypto?: CryptoLike }).crypto;
}

/** Generate an RFC-4122 v4 id, with a safe fallback for old runtimes. */
export function newId(): string {
  const c = getCrypto();
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = randomByte() & 0x0f;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function randomByte(): number {
  const c = getCrypto();
  if (c?.getRandomValues) {
    const a = new Uint8Array(1);
    c.getRandomValues(a);
    return a[0] ?? 0;
  }
  // Last-resort, non-cryptographic fallback.
  return Math.floor(Math.random() * 256);
}
