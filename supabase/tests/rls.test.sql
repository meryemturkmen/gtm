-- Row Level Security is the only authorization layer, so it gets a test: two users, one workspace,
-- the outsider sees nothing and cannot write. Runs with `supabase test db` (pgTAP).
begin;
select plan(8);

insert into auth.users (id, email, aud, role)
values ('11111111-1111-1111-1111-111111111111', 'alice@example.com', 'authenticated', 'authenticated'),
       ('22222222-2222-2222-2222-222222222222', 'bob@example.com',   'authenticated', 'authenticated');

-- Alice creates a workspace and a company.
set local role authenticated;
set local request.jwt.claims = '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}';
select lives_ok($$ select create_workspace('Alice Co') $$, 'alice can create a workspace');
select is((select count(*)::int from workspaces), 1, 'alice sees her workspace');
select lives_ok(
  $$ select upsert_companies((select id from workspaces limit 1), array['acme.de']) $$,
  'alice can add companies to her workspace');
select is((select count(*)::int from companies), 1, 'alice sees her company');
create temp table alice_ws as select id from workspaces;

-- Bob sees none of it and cannot write into it.
set local request.jwt.claims = '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}';
select is((select count(*)::int from workspaces), 0, 'bob sees no workspaces');
select is((select count(*)::int from companies), 0, 'bob sees no companies');
select throws_like(
  $$ select upsert_companies((select id from alice_ws), array['evil.de']) $$,
  '%not allowed%', 'bob cannot add companies through the rpc');
select throws_like(
  $$ insert into properties (workspace_id, key, label, type, source)
     select id, 'x', 'X', 'text', 'input' from alice_ws $$,
  '%row-level security%', 'bob cannot add columns');

select * from finish();
rollback;
