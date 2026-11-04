-- CRM core: contacts, pipelines/stages/deals, activities (timeline), playbooks (automations), api keys.

-- Contacts -----------------------------------------------------------------------------

create table contacts (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  company_id   uuid not null references companies on delete cascade,
  first_name   text not null default '',
  last_name    text not null default '',
  email        text,
  title        text,
  linkedin     text,
  created_at   timestamptz not null default now()
);
create index contacts_company_idx on contacts (company_id);

-- Pipelines, stages, deals -----------------------------------------------------------------

create table pipelines (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now()
);

create table stages (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  pipeline_id  uuid not null references pipelines on delete cascade,
  name         text not null,
  position     int not null,
  outcome      text check (outcome in ('won', 'lost')),
  unique (pipeline_id, position)
);

create table deals (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  company_id   uuid not null references companies on delete cascade,
  stage_id     uuid not null references stages,
  title        text not null,
  amount       numeric(12, 2),
  owner_id     uuid references auth.users on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index deals_stage_idx on deals (stage_id);
create index deals_company_idx on deals (company_id);
create trigger deals_touch before update on deals for each row execute function touch_updated_at();

-- Activities = the timeline on a company ---------------------------------------------------------

create table activities (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  company_id   uuid not null references companies on delete cascade,
  deal_id      uuid references deals on delete cascade,
  kind         text not null check (kind in ('note', 'system')),
  body         text not null,
  meta         jsonb not null default '{}',
  actor_id     uuid references auth.users on delete set null,
  created_at   timestamptz not null default now()
);
create index activities_company_idx on activities (company_id, created_at desc);

-- Playbooks = "when a cell changes, do things" ------------------------------------------------------

create table playbooks (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name         text not null,
  enabled      boolean not null default true,
  trigger_key  text not null,                       -- property key whose successful write fires it
  -- {"op": "gte", "value": 70} | {"op": "eq", "value": true} | {"op": "contains", "value": "Shopify"} | {"op": "any"}
  condition    jsonb not null default '{"op": "any"}',
  -- [{"type": "create_deal", "stage_id": "...", "title": "{{name}}"}, {"type": "webhook", "url": "https://..."},
  --  {"type": "set_property", "key": "...", "value": ...}, {"type": "enqueue", "keys": ["first_line"]}]
  actions      jsonb not null default '[]',
  created_at   timestamptz not null default now()
);

create table playbook_runs (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  playbook_id  uuid not null references playbooks on delete cascade,
  company_id   uuid not null references companies on delete cascade,
  matched      boolean not null,
  result       jsonb not null default '[]',
  error        text,
  created_at   timestamptz not null default now()
);
create index playbook_runs_idx on playbook_runs (playbook_id, created_at desc);
-- A playbook fires at most once per company; re-running an enrichment must not create a second deal.
create unique index playbook_runs_once_idx on playbook_runs (playbook_id, company_id) where matched;

-- Deal stage changes land on the timeline automatically.
create function log_deal_change() returns trigger language plpgsql security definer set search_path = public as $$
declare s stages;
begin
  select * into s from stages where id = new.stage_id;
  if tg_op = 'INSERT' then
    insert into activities (workspace_id, company_id, deal_id, kind, body, meta, actor_id)
    values (new.workspace_id, new.company_id, new.id, 'system', 'Deal "' || new.title || '" created in ' || s.name,
            jsonb_build_object('deal_id', new.id, 'stage', s.name), auth.uid());
  elsif new.stage_id <> old.stage_id then
    insert into activities (workspace_id, company_id, deal_id, kind, body, meta, actor_id)
    values (new.workspace_id, new.company_id, new.id, 'system', 'Deal "' || new.title || '" moved to ' || s.name,
            jsonb_build_object('deal_id', new.id, 'stage', s.name), auth.uid());
  end if;
  return new;
end $$;
create trigger deals_log after insert or update on deals for each row execute function log_deal_change();

-- API keys for the inbound webhook (hash only) -------------------------------------------------------

create table api_keys (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  name         text not null,
  key_hash     text not null unique,
  prefix       text not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

-- RLS ---------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['contacts', 'pipelines', 'stages', 'deals', 'activities', 'playbooks', 'playbook_runs', 'api_keys'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_select on %I for select using (is_member(workspace_id))', t, t);
    execute format('create policy %I_write on %I for all using (can_edit(workspace_id)) with check (can_edit(workspace_id))', t, t);
  end loop;
end $$;

-- Default pipeline on workspace creation -----------------------------------------------------------------

create or replace function create_workspace(p_name text) returns workspaces
language plpgsql security definer set search_path = public as $$
declare ws workspaces; pl pipelines;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into workspaces (name) values (p_name) returning * into ws;
  insert into members (workspace_id, user_id, role) values (ws.id, auth.uid(), 'owner');
  insert into properties (workspace_id, key, label, type, source, config, position) values
    (ws.id, 'name',           'Name',           'text',    'provider', '{"providers": ["website_meta.name"]}', 2),
    (ws.id, 'logo',           'Logo',           'url',     'provider', '{"providers": ["logo.url"]}', 1),
    (ws.id, 'description',    'Description',    'text',    'provider', '{"providers": ["website_meta.description"]}', 3),
    (ws.id, 'tech_stack',     'Tech stack',     'json',    'provider', '{"providers": ["tech_stack.stack"]}', 4),
    (ws.id, 'email_provider', 'Email provider', 'text',    'provider', '{"providers": ["email_provider.provider"]}', 5),
    (ws.id, 'hiring',         'Hiring',         'boolean', 'provider', '{"providers": ["hiring_signal.hiring"]}', 6),
    (ws.id, 'linkedin',       'LinkedIn',       'url',     'provider', '{"providers": ["website_meta.linkedin"]}', 7),
    (ws.id, 'summary', 'Summary', 'text', 'ai', $j${"prompt":"Company {{domain}} ({{name}}). Website description: {{description}}. Tech stack: {{tech_stack}}. Hiring: {{hiring}}.\nIn two plain sentences, what does this company sell and to whom?","schema":{"type":"object","properties":{"text":{"type":"string"}},"required":["text"],"additionalProperties":false},"uses":["name","description","tech_stack","hiring"],"auto":false}$j$, 8),
    (ws.id, 'icp_score', 'ICP score', 'json', 'ai', $j${"prompt":"Ideal customer profile: {{icp}}\n\nCompany {{domain}}: {{summary}} Email provider: {{email_provider}}. Tech stack: {{tech_stack}}. Hiring: {{hiring}}.\nScore 0-100 how well this company fits the profile and give the main reason in one sentence.","schema":{"type":"object","properties":{"score":{"type":"integer","minimum":0,"maximum":100},"reason":{"type":"string"}},"required":["score","reason"],"additionalProperties":false},"uses":["summary","email_provider","tech_stack","hiring"],"auto":false}$j$, 9),
    (ws.id, 'first_line', 'First line', 'text', 'ai', $j${"prompt":"Write one specific, non-salesy opening sentence for a cold email to {{name}} ({{domain}}) based on: {{summary}} Hiring: {{hiring}}. Mention something concrete about them. No greeting, max 25 words.","schema":{"type":"object","properties":{"text":{"type":"string"}},"required":["text"],"additionalProperties":false},"uses":["name","summary","hiring"],"auto":false}$j$, 10),
    (ws.id, 'owner_notes',    'Notes',          'text',    'input',    '{}', 11);
  insert into pipelines (workspace_id, name) values (ws.id, 'Sales') returning * into pl;
  insert into stages (workspace_id, pipeline_id, name, position, outcome) values
    (ws.id, pl.id, 'Lead', 1, null), (ws.id, pl.id, 'Qualified', 2, null), (ws.id, pl.id, 'Meeting', 3, null),
    (ws.id, pl.id, 'Proposal', 4, null), (ws.id, pl.id, 'Won', 5, 'won'), (ws.id, pl.id, 'Lost', 6, 'lost');
  insert into playbooks (workspace_id, name, trigger_key, condition, actions) values
    (ws.id, 'Qualify high ICP fits', 'icp_score', '{"op": "gte", "value": 70}',
     jsonb_build_array(
       jsonb_build_object('type', 'create_deal', 'stage_id', (select id from stages where pipeline_id = pl.id and position = 2), 'title', '{{name}}'),
       jsonb_build_object('type', 'enqueue', 'keys', jsonb_build_array('first_line'))));
  return ws;
end $$;

-- Worker-only helpers --------------------------------------------------------------------------------------

-- Deal creation from a playbook: idempotent per company and stage title.
create function playbook_create_deal(p_company uuid, p_stage uuid, p_title text) returns uuid
language plpgsql security definer set search_path = public as $$
declare d uuid;
begin
  select id into d from deals where company_id = p_company and title = p_title limit 1;
  if d is null then
    insert into deals (workspace_id, company_id, stage_id, title)
    select workspace_id, id, p_stage, p_title from companies where id = p_company
    returning id into d;
  end if;
  return d;
end $$;
revoke execute on function playbook_create_deal(uuid, uuid, text) from public, anon, authenticated;

-- Worker-only enqueue without the membership check (the worker acts on behalf of the system). Idempotent per open cell.
create function enqueue_jobs(p_company uuid, p_keys text[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into jobs (workspace_id, company_id, property_key)
  select c.workspace_id, c.id, k from companies c, unnest(p_keys) as k where c.id = p_company
  on conflict (company_id, property_key) where status in ('queued', 'running') do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function enqueue_jobs(uuid, text[]) from public, anon, authenticated;

alter publication supabase_realtime add table deals, activities;
