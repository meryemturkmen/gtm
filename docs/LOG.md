# Build log

Decisions and state, newest first. Keep entries short.

## 2026-11-04 — Phase 0: foundation

- Stack chosen: Vite + React 19 + Tailwind v4 + TanStack Router/Query on Cloudflare Pages; Supabase (Postgres, Auth magic link, RLS, Realtime, Edge Functions, pg_cron) as the only backend. See ADR 0001–0003.
- Data model: columns are `properties`, values live in `companies.props`. One model for the Clay-style table and the CRM record. See ADR 0002.
- Jobs live in Postgres (`jobs` table, `claim_jobs()` with `SKIP LOCKED`), no queue vendor. See ADR 0003.
- AI goes through any OpenAI-compatible endpoint with `response_format: json_schema`; configured by env only.
- Local Docker via OrbStack. Supabase project is provided by the owner; migrations deploy from GitHub Actions.
- Phases: 0 foundation → 1 enrichment table → 2 AI columns → 3 deals & playbooks → 4 API, dashboard, demo, deploy.
