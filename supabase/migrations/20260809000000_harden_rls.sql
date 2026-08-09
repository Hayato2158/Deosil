-- Browser/BFF requests always run as authenticated users. Background notification
-- functions use Service Role and therefore bypass these policies intentionally.

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
revoke all on table public.sessions from anon, authenticated;
grant select, insert, update on table public.sessions to authenticated;

create policy sessions_select_own
on public.sessions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy sessions_insert_own
on public.sessions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy sessions_update_own
on public.sessions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- DELETE権限とFOR DELETEポリシーを与えず、物理削除を禁止する。

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
grant select, insert, update on table public.push_subscriptions to authenticated;

create policy push_subscriptions_select_own
on public.push_subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy push_subscriptions_insert_own
on public.push_subscriptions
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy push_subscriptions_update_own
on public.push_subscriptions
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- 通知送信履歴はバックグラウンド処理だけが扱う。
alter table public.notification_marks enable row level security;
revoke all on table public.notification_marks from anon, authenticated;

commit;
