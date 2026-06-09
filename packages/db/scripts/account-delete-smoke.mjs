/**
 * End-to-end account-deletion smoke test (PRD §8.3). Proves the `delete_account`
 * RPC purges *all* of a user's data and the auth user itself, relying on the
 * `on delete cascade` FKs every public table carries (see 0001_init).
 *
 * Fully self-contained and non-destructive: it creates a brand-new throwaway
 * user, seeds a row in each synced table, deletes the account, then asserts the
 * cascade emptied every table and the credentials no longer work. It never
 * touches any pre-existing user's data, and cleans up its throwaway user even on
 * failure (so a mid-run abort can't leave orphans).
 *
 * Run after applying migrations to the target (local: `supabase migration up`):
 *   SUPABASE_URL, SUPABASE_ANON_KEY required; SUPABASE_SERVICE_ROLE_KEY optional
 *   (used for a definitive bypass-RLS cross-check + robust cleanup). Without the
 *   first two it skips.
 *
 *   node --env-file=.env packages/db/scripts/account-delete-smoke.mjs
 */
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.log(
    'skip: set SUPABASE_URL and SUPABASE_ANON_KEY to run the account-delete smoke.',
  );
  process.exit(0);
}

const nowIso = () => new Date().toISOString();
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const admin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

const email = `delete-smoke-${crypto.randomUUID().slice(0, 8)}@test.local`;
const password = 'smoke-pass-12345';
const tables = ['snippets', 'tags', 'snippet_tags', 'documents', 'document_items'];

let userId = null;

try {
  // Create the throwaway user. Local auth has email confirmations off (see
  // supabase/config.toml), so sign-up returns a session immediately; the `anon`
  // client holds it in memory and is now authenticated as this user.
  const signUp = await anon.auth.signUp({ email, password });
  assert(!signUp.error, `sign-up failed: ${signUp.error?.message}`);
  let session = signUp.data.session;
  if (!session) {
    const si = await anon.auth.signInWithPassword({ email, password });
    assert(!si.error, `sign-in failed: ${si.error?.message}`);
    session = si.data.session;
  }
  userId = session.user.id;
  console.log(`created throwaway user ${email} (${userId})`);

  // Seed one row in each synced table (RLS requires user_id = auth.uid()).
  const snippetId = crypto.randomUUID();
  const tagId = crypto.randomUUID();
  const docId = crypto.randomUUID();
  const inserts = [
    [
      'snippets',
      {
        id: snippetId,
        user_id: userId,
        type: 'text',
        text: 'delete me',
        url: 'https://example.com/x',
        domain: 'example.com',
        page_title: 'X',
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ],
    [
      'tags',
      {
        id: tagId,
        user_id: userId,
        name: 'smoke-tag',
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ],
    [
      'snippet_tags',
      {
        id: crypto.randomUUID(),
        user_id: userId,
        snippet_id: snippetId,
        tag_id: tagId,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ],
    [
      'documents',
      {
        id: docId,
        user_id: userId,
        title: 'Smoke Doc',
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ],
    [
      'document_items',
      {
        id: crypto.randomUUID(),
        user_id: userId,
        document_id: docId,
        position: 'a0',
        kind: 'snippet_ref',
        snippet_id: snippetId,
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ],
  ];
  for (const [table, row] of inserts) {
    const { error } = await anon.from(table).insert(row);
    assert(!error, `insert ${table}: ${error?.message}`);
  }
  for (const t of tables) {
    const { count, error } = await anon
      .from(t)
      .select('*', { count: 'exact', head: true });
    assert(!error, `count ${t}: ${error?.message}`);
    assert(count >= 1, `expected >=1 row in ${t} before delete, got ${count}`);
  }
  console.log(`ok: seeded ${tables.length} tables`);

  // Erase the account.
  const del = await anon.rpc('delete_account');
  assert(!del.error, `delete_account rpc: ${del.error?.message}`);
  console.log('ok: delete_account() returned without error');

  // Definitive cross-check via service role (bypasses RLS) when available.
  if (admin) {
    for (const t of tables) {
      const { count, error } = await admin
        .from(t)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      assert(!error, `admin count ${t}: ${error?.message}`);
      assert(count === 0, `expected 0 rows in ${t} after delete, got ${count}`);
    }
    const got = await admin.auth.admin.getUserById(userId);
    assert(got.error || !got.data?.user, 'auth user should be deleted');
    userId = null; // already gone — nothing for cleanup to do
    console.log('ok: service-role cross-check — every table empty + auth user gone');
  } else {
    for (const t of tables) {
      const { count } = await anon.from(t).select('*', { count: 'exact', head: true });
      assert(count === 0, `expected 0 rows in ${t} after delete, got ${count}`);
    }
    userId = null;
    console.log(
      'ok: caller now sees 0 rows across all tables (set SERVICE_ROLE for a bypass-RLS check)',
    );
  }

  // The account itself is gone — credentials are rejected.
  const relogin = await anon.auth.signInWithPassword({ email, password });
  assert(!!relogin.error, 'sign-in should fail after account deletion');
  console.log('ok: account deleted — credentials rejected');

  console.log(
    '\nACCOUNT-DELETE SMOKE PASSED ✓  delete_account() purges all data + the auth user',
  );
} catch (err) {
  console.error('FAIL:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  // If we bailed before the account was deleted, remove the throwaway user so a
  // failed run leaves nothing behind. Prefer the service role; fall back to the
  // user's own session calling the RPC.
  if (userId) {
    if (admin) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
    } else {
      await anon.rpc('delete_account').catch(() => {});
    }
  }
}
