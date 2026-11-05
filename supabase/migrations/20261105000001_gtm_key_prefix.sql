-- The product is GTM (Go-to-Market), so API keys start with gtm_. No keys were issued before this migration.
create or replace function create_api_key(p_workspace uuid, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare raw text; hash text;
begin
  if not can_edit(p_workspace) then raise exception 'not allowed'; end if;
  raw := 'gtm_' || encode(extensions.gen_random_bytes(24), 'hex');
  hash := encode(extensions.digest(raw, 'sha256'), 'hex');
  insert into api_keys (workspace_id, name, key_hash, prefix) values (p_workspace, p_name, hash, left(raw, 12));
  return raw;
end $$;
