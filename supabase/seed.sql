-- Local-only seed. Lets pg_cron reach the locally served `run-jobs` function.
-- The key is the public demo service_role JWT every local Supabase stack uses.
select vault.create_secret('http://host.docker.internal:54321/functions/v1/run-jobs', 'run_jobs_url');
select vault.create_secret(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  'service_role_key');
