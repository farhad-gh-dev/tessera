-- M3 / NOTE-3: retain an "edited" flag once captured text is hand-corrected on
-- the platform (the source link is always preserved). Nullable on purpose —
-- `sync_push` populates rows from JSONB and a client that omits the key writes
-- NULL, which we read as "not edited"; a NOT NULL column would reject those
-- pushes. The catalog-driven `sync_push` picks the new column up automatically.
alter table snippets add column if not exists edited boolean;
