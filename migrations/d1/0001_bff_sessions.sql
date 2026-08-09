create table if not exists bff_sessions (
    session_id_hash text primary key,
    user_id text not null,
    encrypted_session text not null,
    access_token_expires_at integer not null,
    idle_expires_at integer not null,
    absolute_expires_at integer not null,
    refresh_lock text,
    refresh_lock_expires_at integer,
    created_at integer not null,
    updated_at integer not null
);

create index if not exists bff_sessions_user_id_idx
on bff_sessions (user_id);

create index if not exists bff_sessions_expiry_idx
on bff_sessions (absolute_expires_at, idle_expires_at);
