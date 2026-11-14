create table if not exists public.account_contact_verifications (
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('email', 'phone')),
  target text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  sent_at timestamptz not null,
  primary key (user_id, purpose)
);

alter table public.account_contact_verifications enable row level security;
revoke all on public.account_contact_verifications from anon, authenticated;
grant all on public.account_contact_verifications to service_role;

create or replace function public.issue_account_contact_verification(
  p_user_id uuid,
  p_purpose text,
  p_target text,
  p_code_hash text,
  p_expires_at timestamptz,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  issued_user_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  insert into public.account_contact_verifications (
    user_id, purpose, target, code_hash, expires_at, attempts, sent_at
  )
  values (
    p_user_id, p_purpose, p_target, p_code_hash, p_expires_at, 0, p_now
  )
  on conflict (user_id, purpose) do update
  set target = excluded.target,
      code_hash = excluded.code_hash,
      expires_at = excluded.expires_at,
      attempts = 0,
      sent_at = excluded.sent_at
  where public.account_contact_verifications.sent_at <= p_now - interval '60 seconds'
  returning user_id into issued_user_id;

  return issued_user_id is not null;
end;
$$;

create or replace function public.consume_account_contact_verification(
  p_user_id uuid,
  p_purpose text,
  p_target text,
  p_code_hash text,
  p_now timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_user_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  update public.account_contact_verifications
  set attempts = attempts + 1
  where user_id = p_user_id
    and purpose = p_purpose
    and target = p_target
    and expires_at > p_now
    and attempts < 5
    and code_hash = p_code_hash
  returning user_id into matched_user_id;

  if matched_user_id is not null then
    delete from public.account_contact_verifications
    where user_id = p_user_id and purpose = p_purpose;
    return true;
  end if;

  update public.account_contact_verifications
  set attempts = attempts + 1
  where user_id = p_user_id
    and purpose = p_purpose
    and target = p_target
    and expires_at > p_now
    and attempts < 5;

  return false;
end;
$$;

revoke all on function public.issue_account_contact_verification(uuid, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.consume_account_contact_verification(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.issue_account_contact_verification(uuid, text, text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.consume_account_contact_verification(uuid, text, text, text, timestamptz) to service_role;
