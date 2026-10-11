-- Phase 1: tenancy. A gym (org) owns its data; people join through memberships.
-- Direct writes to memberships and invites are not granted to clients: every
-- change goes through the security-definer functions below, which enforce the
-- role rules. Triggers repeat the critical invariants so service-role code
-- cannot break them either.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.member_role as enum ('owner', 'lead', 'trainer');

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46})[a-z0-9]$'),
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  email text not null check (email = lower(email) and position('@' in email) > 1),
  role public.member_role not null check (role <> 'owner'),
  token_hash text not null unique,
  invited_by uuid not null references auth.users (id),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index invites_org_idx on public.invites (org_id);

-- Helpers ------------------------------------------------------------------

create function private.role_in(target_org uuid)
returns public.member_role
language sql stable security definer set search_path = ''
as $$
  select m.role from public.memberships m
  where m.org_id = target_org and m.user_id = (select auth.uid())
$$;

create function private.is_member(target_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.role_in(target_org) is not null $$;

grant usage on schema private to authenticated;
grant execute on function private.role_in(uuid), private.is_member(uuid) to authenticated;

-- Invariants (apply to every caller, including the service role) -------------

create function private.guard_memberships()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.org_id <> old.org_id or new.user_id <> old.user_id) then
    raise exception 'membership org and user are immutable' using errcode = 'P0001';
  end if;
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from public.orgs o where o.id = old.org_id)
     and not exists (
       select 1 from public.memberships m
       where m.org_id = old.org_id and m.role = 'owner' and m.user_id <> old.user_id
     ) then
    raise exception 'an org must keep at least one owner' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_guard
before update or delete on public.memberships
for each row execute function private.guard_memberships();

create function private.guard_invites()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.org_id <> old.org_id then
    raise exception 'invite org is immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger invites_guard
before update on public.invites
for each row execute function private.guard_invites();

-- Row level security ---------------------------------------------------------

alter table public.orgs enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;

revoke all on public.orgs, public.memberships, public.invites from anon, authenticated;
grant select on public.orgs, public.memberships, public.invites to authenticated;
grant update (name) on public.orgs to authenticated;

create policy orgs_select on public.orgs for select to authenticated
  using (private.is_member(id));
create policy orgs_update on public.orgs for update to authenticated
  using (private.role_in(id) = 'owner') with check (private.role_in(id) = 'owner');

create policy memberships_select on public.memberships for select to authenticated
  using (private.is_member(org_id));

create policy invites_select on public.invites for select to authenticated
  using (private.role_in(org_id) in ('owner', 'lead'));

-- Functions clients call -----------------------------------------------------

create function public.create_org(org_name text, org_slug text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  new_id uuid;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  insert into public.orgs (name, slug) values (org_name, org_slug) returning id into new_id;
  insert into public.memberships (org_id, user_id, role) values (new_id, uid, 'owner');
  return new_id;
end;
$$;

-- Returns the raw token once; only its hash is stored.
create function public.create_invite(target_org uuid, invitee_email text, invitee_role public.member_role)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  caller public.member_role := private.role_in(target_org);
  raw_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if caller is null then raise exception 'not a member of this org' using errcode = '42501'; end if;
  if invitee_role = 'owner' then raise exception 'owners cannot be invited' using errcode = '42501'; end if;
  if invitee_role = 'lead' and caller <> 'owner' then
    raise exception 'only owners can invite leads' using errcode = '42501';
  end if;
  if caller = 'trainer' then raise exception 'trainers cannot invite' using errcode = '42501'; end if;
  insert into public.invites (org_id, email, role, token_hash, invited_by)
  values (target_org, lower(invitee_email), invitee_role,
          encode(extensions.digest(raw_token, 'sha256'), 'hex'), (select auth.uid()));
  return raw_token;
end;
$$;

create function public.accept_invite(invite_token text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  caller_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  inv public.invites%rowtype;
begin
  if uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select * into inv from public.invites
  where token_hash = encode(extensions.digest(invite_token, 'sha256'), 'hex')
  for update;
  if not found or inv.accepted_at is not null or inv.expires_at < now() then
    raise exception 'invite is invalid or expired' using errcode = '42501';
  end if;
  if inv.email <> caller_email then
    raise exception 'invite was sent to a different email' using errcode = '42501';
  end if;
  insert into public.memberships (org_id, user_id, role) values (inv.org_id, uid, inv.role)
  on conflict (org_id, user_id) do nothing;
  update public.invites set accepted_at = now(), accepted_by = uid where id = inv.id;
  return inv.org_id;
end;
$$;

create function public.set_member_role(target_org uuid, member uuid, new_role public.member_role)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if private.role_in(target_org) is distinct from 'owner' then
    raise exception 'only owners can change roles' using errcode = '42501';
  end if;
  update public.memberships set role = new_role where org_id = target_org and user_id = member;
  if not found then raise exception 'no such member' using errcode = 'P0002'; end if;
end;
$$;

-- Owners remove anyone; any member may leave. The last owner cannot go (trigger).
create function public.remove_member(target_org uuid, member uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if member <> (select auth.uid()) and private.role_in(target_org) is distinct from 'owner' then
    raise exception 'only owners can remove other members' using errcode = '42501';
  end if;
  delete from public.memberships where org_id = target_org and user_id = member;
  if not found then raise exception 'no such member' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.create_org(text, text), public.create_invite(uuid, text, public.member_role),
  public.accept_invite(text), public.set_member_role(uuid, uuid, public.member_role),
  public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.create_org(text, text), public.create_invite(uuid, text, public.member_role),
  public.accept_invite(text), public.set_member_role(uuid, uuid, public.member_role),
  public.remove_member(uuid, uuid) to authenticated;
revoke all on function private.guard_memberships(), private.guard_invites() from public;
