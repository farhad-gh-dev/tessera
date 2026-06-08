/**
 * End-to-end sync smoke test: the in-memory convergence proof from
 * `engine.test.ts`, but run against a REAL Supabase project — exercising the
 * `SupabaseRemoteAdapter`, the `sync_push` function, and row-level security.
 *
 * Two `MemoryLocalStore`s stand in for two devices; they share one
 * `SupabaseRemoteAdapter` (the cloud). (The Dexie local store itself is a
 * browser component, validated in-app during M1/M2 — this script proves the
 * remote half of the path.)
 *
 * Run after `npm run build`, with these set (see `.env.example`):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, TESSERA_TEST_EMAIL, TESSERA_TEST_PASSWORD
 * Without them it skips with exit code 0.
 *
 *   node --env-file=../../.env scripts/sync-smoke.mjs
 */
import { createClient } from '@supabase/supabase-js';
import {
  SyncEngine,
  MemoryLocalStore,
  SupabaseRemoteAdapter,
  localUpsert,
  localDelete,
} from '../dist/index.js';

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
      'TESSERA_TEST_PASSWORD to run the live smoke test.',
  );
  process.exit(0);
}

const nowIso = () => new Date().toISOString();
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

/**
 * Sign in, creating the throwaway user on first run. Local auth has email
 * confirmations off (see supabase/config.toml), so sign-up returns a session
 * immediately; on a hosted project with confirmations on, you'd confirm first.
 */
async function ensureSignedIn(c, email, password) {
  const signIn = await c.auth.signInWithPassword({ email, password });
  if (!signIn.error) return signIn.data.session;

  const signUp = await c.auth.signUp({ email, password });
  if (signUp.error) {
    console.error('sign-in failed:', signIn.error.message);
    console.error('sign-up failed:', signUp.error.message);
    process.exit(1);
  }
  if (signUp.data.session) return signUp.data.session;

  const retry = await c.auth.signInWithPassword({ email, password });
  if (retry.error) {
    console.error(
      'created the user but sign-in failed (email confirmation may be required):',
      retry.error.message,
    );
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

const tables = ['snippets'];
const remote = new SupabaseRemoteAdapter(client);
const a = new MemoryLocalStore();
const b = new MemoryLocalStore();
const engA = new SyncEngine({ local: a, remote, tables });
const engB = new SyncEngine({ local: b, remote, tables });

const id = crypto.randomUUID();
const snippet = {
  id,
  userId,
  type: 'text',
  text: 'smoke v1',
  url: 'https://example.com/smoke',
  domain: 'example.com',
  pageTitle: 'Smoke',
  createdAt: nowIso(),
  updatedAt: nowIso(),
};

try {
  // 1) device A creates -> cloud -> device B
  await localUpsert(a, 'snippets', snippet);
  await engA.syncOnce();
  await engB.syncOnce();
  assert(
    (await b.get('snippets', id))?.text === 'smoke v1',
    'B should receive the snippet',
  );
  console.log('ok: create propagated  A → cloud → B');

  // 2) device B edits -> cloud -> device A (last-write-wins)
  await localUpsert(b, 'snippets', {
    ...(await b.get('snippets', id)),
    text: 'smoke v2',
  });
  await engB.syncOnce();
  await engA.syncOnce();
  assert(
    (await a.get('snippets', id))?.text === 'smoke v2',
    'A should converge to B edit',
  );
  console.log('ok: edit converged     B → cloud → A  (LWW)');

  // 3) device A deletes -> tombstone -> device B
  await localDelete(a, 'snippets', id);
  await engA.syncOnce();
  await engB.syncOnce();
  assert((await b.get('snippets', id))?.deletedAt != null, 'B should see the tombstone');
  console.log('ok: delete propagated  A → cloud → B  (tombstone)');

  console.log('\nSMOKE PASSED ✓  remote adapter + sync_push + RLS verified end-to-end');
} finally {
  // Best-effort cleanup so the smoke test is repeatable.
  const { error } = await client.from('snippets').delete().eq('id', id);
  if (error) console.warn('cleanup warning:', error.message);
  await client.auth.signOut();
}
