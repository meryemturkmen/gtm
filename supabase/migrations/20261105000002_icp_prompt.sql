-- The ICP score must judge on the evidence it has: unknown facts are neutral, not a mismatch.
-- Same create_workspace as 20261104000002 with the icp_score prompt reworded; existing workspaces keep their prompt.
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
    (ws.id, 'tech_stack',     'Tech Stack',     'json',    'provider', '{"providers": ["tech_stack.stack"]}', 4),
    (ws.id, 'email_provider', 'Email Provider', 'text',    'provider', '{"providers": ["email_provider.provider"]}', 5),
    (ws.id, 'hiring',         'Hiring',         'boolean', 'provider', '{"providers": ["hiring_signal.hiring"]}', 6),
    (ws.id, 'linkedin',       'LinkedIn',       'url',     'provider', '{"providers": ["website_meta.linkedin"]}', 7),
    (ws.id, 'summary', 'Summary', 'text', 'ai', $j${"prompt":"Company {{domain}} ({{name}}). Website description: {{description}}. Tech stack: {{tech_stack}}. Hiring: {{hiring}}.\nIn two plain sentences, what does this company sell and to whom?","schema":{"type":"object","properties":{"text":{"type":"string"}},"required":["text"],"additionalProperties":false},"uses":["name","description","tech_stack","hiring"],"auto":false}$j$, 8),
    (ws.id, 'icp_score', 'ICP Score', 'json', 'ai', $j${"prompt":"Ideal customer profile: {{icp}}\n\nCompany {{domain}}: {{summary}} Email provider: {{email_provider}}. Tech stack: {{tech_stack}}. Hiring: {{hiring}}.\nScore 0-100 how well this company fits the profile, judging only on the evidence above. Facts that are not mentioned are neutral, not a mismatch. Give the main reason in one sentence.","schema":{"type":"object","properties":{"score":{"type":"integer","minimum":0,"maximum":100},"reason":{"type":"string"}},"required":["score","reason"],"additionalProperties":false},"uses":["summary","email_provider","tech_stack","hiring"],"auto":false}$j$, 9),
    (ws.id, 'first_line', 'First Line', 'text', 'ai', $j${"prompt":"Write one specific, non-salesy opening sentence for a cold email to {{name}} ({{domain}}) based on: {{summary}} Hiring: {{hiring}}. Mention something concrete about them. No greeting, max 25 words.","schema":{"type":"object","properties":{"text":{"type":"string"}},"required":["text"],"additionalProperties":false},"uses":["name","summary","hiring"],"auto":false}$j$, 10),
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
