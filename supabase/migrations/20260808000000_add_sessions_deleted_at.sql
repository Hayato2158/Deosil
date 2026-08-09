begin;

alter table public.sessions
add column if not exists deleted_at timestamptz;

create index if not exists sessions_user_id_deleted_at_idx
on public.sessions (user_id, deleted_at);

comment on column public.sessions.deleted_at is
'Soft deletion timestamp. NULL means the session is active.';

commit;
