create table if not exists login_attempts (
    attempt_key text primary key,
    failures integer not null,
    blocked_until integer not null,
    last_attempt_at integer not null
);

create index if not exists login_attempts_last_attempt_idx
on login_attempts (last_attempt_at);
