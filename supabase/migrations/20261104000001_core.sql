-- GMT core schema: workspaces, members, properties (columns), companies (rows), runs (provenance), jobs (queue).
-- Authorization is RLS. Helper functions are SECURITY DEFINER so policies never recurse through `members`.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Workspaces & members -------------------------------------------------------

create table workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 80),
  icp         text not null default '',
  created_at  timestamptz not null default now()
);

create type member_role as enum ('owner', 'editor', 'viewer');

create table members (
  workspace_id uuid not null references workspaces on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  role         member_role not null default 'editor',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index members_user_idx on members (user_id);

create function is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where workspace_id = ws and user_id = auth.uid());
$$;

create function can_edit(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members
    where workspace_id = ws and user_id = auth.uid() and role in ('owner', 'editor')
  );
$$;

-- Properties = columns ---------------------------------------------------------

create table properties (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  key          text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label        text not null check (length(label) between 1 and 60),
  type         text not null check (type in ('text', 'number', 'boolean', 'url', 'enum', 'json')),
  source       text not null check (source in ('input', 'provider', 'ai')),
  -- provider: {"providers": ["website_meta.description", "ai"], "auto": true}
  -- ai:       {"prompt": "...", "schema": {...}, "uses": ["description"], "auto": false}
  config       jsonb not null default '{}',
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  unique (workspace_id, key)
);

-- Companies = rows ---------------------------------------------------------------

create table companies (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  domain       text not null check (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  name         text,
  props        jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, domain)
);
create index companies_props_idx on companies using gin (props);

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger companies_touch before update on companies
  for each row execute function touch_updated_at();

-- Runs = provenance per cell write ---------------------------------------------

create table runs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  company_id   uuid not null references companies on delete cascade,
  property_key text not null,
  provider     text not null,
  status       text not null check (status in ('done', 'empty', 'failed')),
  input        jsonb,
  output       jsonb,
  error        text,
  tokens       int not null default 0,
  cost_cents   numeric(10, 4) not null default 0,
  duration_ms  int not null default 0,
  created_at   timestamptz not null default now()
);
create index runs_company_idx on runs (company_id, property_key, created_at desc);

-- Jobs = the queue (ADR 0003) --------------------------------------------------------

create table jobs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  company_id   uuid not null references companies on delete cascade,
  property_key text not null,
  status       text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts     int not null default 0,
  run_after    timestamptz not null default now(),
  locked_at    timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index jobs_open_cell_idx on jobs (company_id, property_key)
  where status in ('queued', 'running');
create index jobs_claim_idx on jobs (run_after) where status = 'queued';
create trigger jobs_touch before update on jobs
  for each row execute function touch_updated_at();

-- RLS ---------------------------------------------------------------------------------

alter table workspaces enable row level security;
alter table members    enable row level security;
alter table properties enable row level security;
alter table companies  enable row level security;
alter table runs       enable row level security;
alter table jobs       enable row level security;

create policy workspaces_select on workspaces for select using (is_member(id));
create policy workspaces_update on workspaces for update using (can_edit(id));

create policy members_select on members for select using (is_member(workspace_id));

create policy properties_select on properties for select using (is_member(workspace_id));
create policy properties_write  on properties for all
  using (can_edit(workspace_id)) with check (can_edit(workspace_id));

create policy companies_select on companies for select using (is_member(workspace_id));
create policy companies_write  on companies for all
  using (can_edit(workspace_id)) with check (can_edit(workspace_id));

create policy runs_select on runs for select using (is_member(workspace_id));

create policy jobs_select on jobs for select using (is_member(workspace_id));
-- jobs are inserted through enqueue(); workers use the service role which bypasses RLS.

-- RPCs ---------------------------------------------------------------------------------

-- Creates a workspace and makes the caller its owner (members has no insert policy on purpose).
create function create_workspace(p_name text) returns workspaces
language plpgsql security definer set search_path = public as $$
declare ws workspaces;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into workspaces (name) values (p_name) returning * into ws;
  insert into members (workspace_id, user_id, role) values (ws.id, auth.uid(), 'owner');
  return ws;
end $$;

-- Normalises anything that looks like a domain or URL to "example.com".
create function normalize_domain(raw text) returns text
language sql immutable as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(trim(raw)), '^[a-z]+://', ''),
      '^www\.|[/?#:].*$', '', 'g'),
    '');
$$;

-- Adds domains to a workspace (ignores duplicates and junk) and queues auto-run columns for the new rows.
create function upsert_companies(p_workspace uuid, p_domains text[]) returns setof companies
language plpgsql security definer set search_path = public as $$
begin
  if not can_edit(p_workspace) then raise exception 'not allowed'; end if;
  return query
  with cleaned as (
    select distinct normalize_domain(d) as domain from unnest(p_domains) as d
  ),
  inserted as (
    insert into companies (workspace_id, domain)
    select p_workspace, domain from cleaned
    where domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'
    on conflict (workspace_id, domain) do nothing
    returning *
  ),
  queued as (
    insert into jobs (workspace_id, company_id, property_key)
    select p_workspace, i.id, p.key
    from inserted i
    join properties p on p.workspace_id = p_workspace
      and p.source in ('provider', 'ai')
      and coalesce((p.config ->> 'auto')::boolean, true)
    on conflict (company_id, property_key) where status in ('queued', 'running') do nothing
  )
  select * from inserted;
end $$;

-- Queues the given columns for the given companies. Idempotent per open cell.
create function enqueue(p_company_ids uuid[], p_keys text[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into jobs (workspace_id, company_id, property_key)
  select c.workspace_id, c.id, k
  from companies c, unnest(p_keys) as k
  where c.id = any (p_company_ids) and can_edit(c.workspace_id)
  on conflict (company_id, property_key) where status in ('queued', 'running') do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Worker-only: atomically claims up to n due jobs. SKIP LOCKED keeps parallel workers apart.
create function claim_jobs(n int) returns setof jobs
language sql security definer set search_path = public as $$
  update jobs set status = 'running', locked_at = now(), attempts = attempts + 1
  where id in (
    select id from jobs
    where status = 'queued' and run_after <= now()
    order by created_at
    limit n
    for update skip locked
  )
  returning *;
$$;
revoke execute on function claim_jobs(int) from public, anon, authenticated;

-- Realtime ------------------------------------------------------------------------------

alter publication supabase_realtime add table companies, jobs;
