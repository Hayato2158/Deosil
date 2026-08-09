begin;

-- Required by the pg_cron jobs that invoke the secured Edge Function.
create extension if not exists pg_net with schema extensions;

commit;
