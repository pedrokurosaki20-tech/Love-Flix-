create table if not exists public.sessao_flix_rooms (
  room_id text primary key check (room_id ~ '^[A-Za-z0-9_-]{3,64}$'),
  state jsonb not null,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessao_flix_rooms_expires_at_idx
  on public.sessao_flix_rooms (expires_at);

alter table public.sessao_flix_rooms enable row level security;
revoke all on public.sessao_flix_rooms from anon, authenticated;
grant all on public.sessao_flix_rooms to service_role;
