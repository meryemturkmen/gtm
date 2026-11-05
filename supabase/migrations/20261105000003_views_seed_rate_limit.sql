-- Saved views, a seed list that survives the demo sweep, and a rate limit on inbound API keys.

-- Saved views: a name plus the table state (search, sort, filters) as JSON. ------------------------------
create table saved_views (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name         text not null,
  query        jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
alter table saved_views enable row level security;
create policy saved_views_select on saved_views for select using (is_member(workspace_id));
create policy saved_views_write  on saved_views for all using (can_edit(workspace_id)) with check (can_edit(workspace_id));

-- Demo sweep keeps the seed companies, so the public demo never shows an empty table. ----------------------
alter table workspaces add column demo_seed text[] not null default '{}';

create or replace function sweep_demo_workspaces() returns void
language sql security definer set search_path = public as $$
  delete from companies c using workspaces w
  where c.workspace_id = w.id and w.is_demo and c.created_at < now() - interval '24 hours'
    and c.domain <> all (w.demo_seed);
$$;

-- Inbound API: at most 60 calls per key per minute. The hits table is pruned on every call. --------------
create table api_key_hits (
  key_id uuid not null references api_keys on delete cascade,
  at     timestamptz not null default now()
);
create index api_key_hits_idx on api_key_hits (key_id, at);
alter table api_key_hits enable row level security; -- worker only, no policies

create or replace function resolve_api_key(p_raw text) returns uuid
language plpgsql security definer set search_path = public as $$
declare k api_keys;
begin
  select * into k from api_keys where key_hash = encode(extensions.digest(p_raw, 'sha256'), 'hex');
  if k.id is null then return null; end if;
  delete from api_key_hits where at < now() - interval '1 hour';
  if (select count(*) from api_key_hits where key_id = k.id and at > now() - interval '1 minute') >= 60 then
    raise exception 'rate limited: 60 calls per minute per key';
  end if;
  insert into api_key_hits (key_id) values (k.id);
  update api_keys set last_used_at = now() where id = k.id;
  return k.workspace_id;
end $$;
