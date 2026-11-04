-- Inbound API keys, demo workspace reset, dashboard stats.

-- API keys: the plaintext is returned once; only its SHA-256 is stored. --------------------------------

create function create_api_key(p_workspace uuid, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare raw text; hash text;
begin
  if not can_edit(p_workspace) then raise exception 'not allowed'; end if;
  raw := 'gmt_' || encode(extensions.gen_random_bytes(24), 'hex');
  hash := encode(extensions.digest(raw, 'sha256'), 'hex');
  insert into api_keys (workspace_id, name, key_hash, prefix) values (p_workspace, p_name, hash, left(raw, 12));
  return raw;
end $$;

-- Worker-only: resolves a key to its workspace and stamps last_used_at.
create function resolve_api_key(p_raw text) returns uuid
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  update api_keys set last_used_at = now()
  where key_hash = encode(extensions.digest(p_raw, 'sha256'), 'hex')
  returning workspace_id into ws;
  return ws;
end $$;
revoke execute on function resolve_api_key(text) from public, anon, authenticated;

-- Worker-only upsert without the membership check, used by the ingest function after it verified the key.
create function ingest_companies(p_workspace uuid, p_domains text[]) returns setof companies
language plpgsql security definer set search_path = public as $$
begin
  return query
  with cleaned as (select distinct normalize_domain(d) as domain from unnest(p_domains) as d),
  inserted as (
    insert into companies (workspace_id, domain)
    select p_workspace, domain from cleaned where domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'
    on conflict (workspace_id, domain) do nothing
    returning *
  ),
  queued as (
    insert into jobs (workspace_id, company_id, property_key)
    select p_workspace, i.id, p.key from inserted i
    join properties p on p.workspace_id = p_workspace and p.source in ('provider', 'ai') and coalesce((p.config ->> 'auto')::boolean, true)
    on conflict (company_id, property_key) where status in ('queued', 'running') do nothing
  )
  select * from inserted;
end $$;
revoke execute on function ingest_companies(uuid, text[]) from public, anon, authenticated;

-- Demo workspaces: anything older than a day is swept hourly so the public demo stays small and fresh. -----

alter table workspaces add column is_demo boolean not null default false;

create function sweep_demo_workspaces() returns void
language sql security definer set search_path = public as $$
  delete from companies c using workspaces w
  where c.workspace_id = w.id and w.is_demo and c.created_at < now() - interval '24 hours';
$$;
select cron.schedule('sweep-demo', '17 * * * *', 'select sweep_demo_workspaces()');

-- Dashboard: one round trip for the numbers. ----------------------------------------------------------------

create function workspace_stats(p_workspace uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'companies', (select count(*) from companies where workspace_id = p_workspace),
    'contacts',  (select count(*) from contacts  where workspace_id = p_workspace),
    'open_jobs', (select count(*) from jobs where workspace_id = p_workspace and status in ('queued', 'running')),
    'runs',      (select count(*) from runs where workspace_id = p_workspace),
    'tokens',    (select coalesce(sum(tokens), 0) from runs where workspace_id = p_workspace),
    'cost_cents',(select coalesce(sum(cost_cents), 0) from runs where workspace_id = p_workspace),
    'avg_icp',   (select round(avg((props -> 'icp_score' ->> 'score')::numeric)) from companies
                  where workspace_id = p_workspace and props -> 'icp_score' ->> 'score' is not null),
    'coverage',  (select coalesce(jsonb_object_agg(key, filled), '{}') from (
                    select p.key, count(c.id) filter (where c.meta -> p.key ->> 'status' = 'done') as filled
                    from properties p left join companies c on c.workspace_id = p.workspace_id
                    where p.workspace_id = p_workspace and p.source <> 'input' group by p.key) x),
    'stages',    (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'count', n.count, 'amount', n.amount) order by s.position), '[]')
                  from stages s left join lateral (
                    select count(*) as count, coalesce(sum(amount), 0) as amount from deals d where d.stage_id = s.id) n on true
                  where s.workspace_id = p_workspace),
    'playbook_fires', (select count(*) from playbook_runs where workspace_id = p_workspace and matched)
  ) where is_member(p_workspace);
$$;
