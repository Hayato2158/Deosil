-- Emergency rollback for the RLS state observed immediately before
-- 20260809000000_harden_rls.sql was applied.
-- This intentionally restores the former broad table grants. Use only to recover
-- from a failed rollout, then re-apply the hardened migration promptly.

begin;

do $$
declare
  target_table text;
  existing_policy record;
begin
  foreach target_table in array array['sessions', 'push_subscriptions', 'notification_marks']
  loop
    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy if exists %I on public.%I', existing_policy.policyname, target_table);
    end loop;
  end loop;
end
$$;

alter table public.sessions enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_marks enable row level security;

revoke all on table public.sessions, public.push_subscriptions, public.notification_marks
from anon, authenticated;
grant all privileges on table public.sessions, public.push_subscriptions, public.notification_marks
to anon, authenticated;

create policy sessions_select_own
on public.sessions
for select
to authenticated
using (user_id = (select auth.uid()));

create policy sessions_insert_own
on public.sessions
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy sessions_update_own
on public.sessions
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy push_subscriptions_select_own
on public.push_subscriptions
for select
to public
using (auth.uid() = user_id);

create policy push_subscriptions_insert_own
on public.push_subscriptions
for insert
to public
with check (auth.uid() = user_id);

create policy push_subscriptions_update_own
on public.push_subscriptions
for update
to public
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy push_subscriptions_delete_own
on public.push_subscriptions
for delete
to public
using (auth.uid() = user_id);

commit;
