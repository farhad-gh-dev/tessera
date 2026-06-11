import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'snippet-images';

/**
 * Upload a captured image / screenshot blob to the private `snippet-images`
 * bucket, under the owner's folder (`{userId}/...`, enforced by RLS). Returns the
 * storage path, which is stored on the snippet's `imagePath`. (PRD §8.4 — copy
 * into user storage so snippets survive source link rot.)
 */
export async function uploadSnippetImage(
  supabase: SupabaseClient,
  userId: string,
  snippetId: string,
  blob: Blob,
): Promise<string> {
  const path = `${userId}/${snippetId}.${extensionFor(blob.type)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || 'application/octet-stream',
    upsert: true,
  });
  if (error) throw new Error(`image upload failed: ${error.message}`);
  return path;
}

/**
 * Remove a previously uploaded image/screenshot from the bucket. Called when its
 * snippet is deleted so storage doesn't accumulate orphans. Best-effort: the
 * caller treats failures as non-fatal (the snippet tombstone is what matters).
 */
export async function removeSnippetImage(
  supabase: SupabaseClient,
  path: string,
): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`image remove failed: ${error.message}`);
}

/**
 * Upload one inline image of a *text* snippet — an image that sat between the
 * selected text (IMG-4). Keyed under a per-snippet folder so a single snippet can
 * own many; the saved html records the returned path, and delete reads those
 * paths back to clear them (IMG-8). Distinct from {@link uploadSnippetImage},
 * which keys a lone image/screenshot snippet by its own id.
 */
export async function uploadInlineImage(
  supabase: SupabaseClient,
  userId: string,
  snippetId: string,
  index: number,
  blob: Blob,
): Promise<string> {
  const path = `${userId}/${snippetId}/${index}.${extensionFor(blob.type)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || 'application/octet-stream',
    upsert: true,
  });
  if (error) throw new Error(`inline image upload failed: ${error.message}`);
  return path;
}

/** Best-effort bulk removal of uploaded objects (a snippet's inline images, IMG-8). */
export async function removeSnippetImages(
  supabase: SupabaseClient,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw new Error(`image remove failed: ${error.message}`);
}

function extensionFor(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'bin';
  }
}
