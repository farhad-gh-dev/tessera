/**
 * Storage smoke test: verifies the `snippet-images` bucket and its per-user RLS
 * against a REAL Supabase project — the durability path for image/screenshot
 * captures (PRD §8.4). The browser-side capture (captureVisibleTab, OffscreenCanvas
 * crop) is manual; this proves the upload/download + access control.
 *
 * Run after the migrations are applied, with these set (see `.env.example`):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, TESSERA_TEST_EMAIL, TESSERA_TEST_PASSWORD
 *
 *   node --env-file=.env packages/db/scripts/storage-smoke.mjs
 */
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_ANON_KEY, TESSERA_TEST_EMAIL, TESSERA_TEST_PASSWORD } =
  process.env;

if (
  !SUPABASE_URL ||
  !SUPABASE_ANON_KEY ||
  !TESSERA_TEST_EMAIL ||
  !TESSERA_TEST_PASSWORD
) {
  console.log(
    'skip: set SUPABASE_URL, SUPABASE_ANON_KEY, TESSERA_TEST_EMAIL, ' +
      'TESSERA_TEST_PASSWORD to run the storage smoke test.',
  );
  process.exit(0);
}

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function ensureSignedIn(client, email, password) {
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (!signIn.error) return signIn.data.session;
  const signUp = await client.auth.signUp({ email, password });
  if (signUp.error) {
    console.error('sign-in failed:', signIn.error.message);
    console.error('sign-up failed:', signUp.error.message);
    process.exit(1);
  }
  if (signUp.data.session) return signUp.data.session;
  const retry = await client.auth.signInWithPassword({ email, password });
  if (retry.error) {
    console.error('sign-in failed after sign-up:', retry.error.message);
    process.exit(1);
  }
  return retry.data.session;
}

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const session = await ensureSignedIn(client, TESSERA_TEST_EMAIL, TESSERA_TEST_PASSWORD);
const userId = session.user.id;
console.log(`signed in as ${TESSERA_TEST_EMAIL} (${userId})`);

const bucket = client.storage.from('snippet-images');
// A 1x1 transparent PNG.
const png = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);
const path = `${userId}/smoke.png`;

try {
  const up = await bucket.upload(path, new Blob([png], { type: 'image/png' }), {
    contentType: 'image/png',
    upsert: true,
  });
  assert(!up.error, up.error?.message ?? 'upload');
  console.log('ok: uploaded', path);

  const dl = await bucket.download(path);
  assert(!dl.error && dl.data, dl.error?.message ?? 'download');
  assert(dl.data.size > 0, 'downloaded blob is empty');
  console.log('ok: downloaded', dl.data.size, 'bytes');

  const forbidden = await bucket.upload(
    'someone-else/x.png',
    new Blob([png], { type: 'image/png' }),
    { upsert: true },
  );
  assert(forbidden.error, 'RLS should block writing to another user’s folder');
  console.log('ok: RLS blocked a cross-user write');

  console.log('\nSTORAGE SMOKE PASSED ✓  bucket + per-user RLS verified');
} finally {
  await bucket.remove([path]);
  await client.auth.signOut();
}
