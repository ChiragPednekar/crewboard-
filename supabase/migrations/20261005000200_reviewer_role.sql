-- A "reviewer" can review and approve work (e.g. a senior editor) without being a full admin.
-- Kept in its own migration: a new enum value can't be used in the transaction that adds it.
alter type public.user_role add value if not exists 'reviewer';
