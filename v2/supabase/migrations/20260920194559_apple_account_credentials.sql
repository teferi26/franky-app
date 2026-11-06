-- Service-only encrypted credentials. A pending exchange prevents an erasure
-- from completing while a login already authorized by Apple finishes.
create table account_private.apple_credentials (
  revision uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token text,
  pending_until timestamptz not null default now()+interval '30 minutes',
  created_at timestamptz not null default now()
);
create index on account_private.apple_credentials(user_id);
alter table account_private.apple_credentials enable row level security;
revoke all on account_private.apple_credentials from public, anon, authenticated;

create function public.begin_apple_account_credential(p_user uuid,p_subject text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  if exists(select 1 from account_private.erasures where user_id=p_user)
     or exists(select 1 from social_private.account_suspensions where user_id=p_user and restored_at is null)
     or not exists(select 1 from auth.identities where user_id=p_user and provider='apple' and provider_id=p_subject)
  then raise exception 'apple_account_unavailable'; end if;
  insert into account_private.apple_credentials(user_id) values(p_user) returning revision into result;
  return result;
end $$;
create function public.store_apple_account_credential(p_user uuid,p_revision uuid,p_token text)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  if length(p_token) not between 32 and 16384 then raise exception 'invalid_credential'; end if;
  update account_private.apple_credentials set token=p_token
    where user_id=p_user and revision=p_revision and pending_until>now();
  if not found then raise exception 'apple_reservation_expired'; end if;
  update account_private.erasures set apple_revoked_at=null where user_id=p_user;
end $$;
create function public.get_apple_account_credential(p_user uuid)
returns jsonb language sql security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('token',token,'revision',revision)),'[]'::jsonb)
    from account_private.apple_credentials where user_id=p_user and (token is not null or pending_until>now());
$$;
create function public.remove_apple_account_credential(p_user uuid,p_revision uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  delete from account_private.apple_credentials where user_id=p_user and revision=p_revision;
  return true;
end $$;

-- This guard also protects completion if a worker races a late token exchange.
create function account_private.guard_apple_erasure_completion()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.state='complete' then
    perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
    if exists(select 1 from account_private.apple_credentials where user_id=new.user_id and (token is not null or pending_until>now()))
    then raise exception 'apple_revocation_pending'; end if;
    delete from account_private.apple_credentials where user_id=new.user_id;
  end if;
  return new;
end $$;
create trigger guard_apple_erasure_completion before update on account_private.erasures
for each row execute function account_private.guard_apple_erasure_completion();
revoke all on function account_private.guard_apple_erasure_completion() from public,anon,authenticated;
revoke all on function public.begin_apple_account_credential(uuid,text),public.store_apple_account_credential(uuid,uuid,text),
 public.get_apple_account_credential(uuid),public.remove_apple_account_credential(uuid,uuid) from public,anon,authenticated;
grant execute on function public.begin_apple_account_credential(uuid,text),public.store_apple_account_credential(uuid,uuid,text),
 public.get_apple_account_credential(uuid),public.remove_apple_account_credential(uuid,uuid) to service_role;
