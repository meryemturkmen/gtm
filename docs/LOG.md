# Build log

Decisions and state, newest first. Keep entries short.

## 2026-11-04 — Phase 0: foundation

- Stack chosen: Vite + React 19 + Tailwind v4 + TanStack Router/Query on Cloudflare Pages; Supabase (Postgres, Auth magic link, RLS, Realtime, Edge Functions, pg_cron) as the only backend. See ADR 0001–0003.
- Data model: columns are `properties`, values live in `companies.props`. One model for the Clay-style table and the CRM record. See ADR 0002.
- Jobs live in Postgres (`jobs` table, `claim_jobs()` with `SKIP LOCKED`), no queue vendor. See ADR 0003.
- AI goes through any OpenAI-compatible endpoint with `response_format: json_schema`; configured by env only.
- Local Docker via OrbStack. Supabase project is provided by the owner; migrations deploy from GitHub Actions.
- Phases: 0 foundation → 1 enrichment table → 2 AI columns → 3 deals & playbooks → 4 API, dashboard, demo, deploy.

## 2026-11-04 — Phase 1: enrichment engine and table

- The engine is runtime-agnostic (`supabase/functions/_shared/engine.ts`) and talks to PostgREST with plain `fetch` (`db.ts`), no SDK. Reason: the local Docker edge runtime froze a 16 GB Mac twice; `npm run worker` runs the identical engine in Node against the local stack. In the cloud the edge function `run-jobs` wraps the same code.
- Local Supabase config disables Studio, Analytics, Storage and the edge runtime to keep memory low. Re-enable per need in `supabase/config.toml`.
- Provider runs are cached per company for `cacheHours` via the `runs` table, so several columns fed by one provider share one HTTP fetch.
- Migrations are still editable: nothing is deployed yet. From the first cloud deploy on, only add new files.

## 2026-11-04 — Phases 2–4: AI columns, CRM core, API, dashboard

- AI columns are `auto: false` by default: new rows get the free providers immediately, AI runs only from the column menu or a playbook (cost control). The three seeded AI columns (Summary, ICP score, First line) reference each other; the worker enriches dependencies first and requeues.
- Playbooks run inside the worker after a cell write (ADR 0004). Default playbook: ICP ≥ 70 → deal in Qualified + run First line.
- Worker-only RPCs (`claim_jobs`, `set_cell`, `enqueue_jobs`, `playbook_create_deal`, `resolve_api_key`, `ingest_companies`) have EXECUTE revoked from `authenticated`; only the service role reaches them.
- Postgres partial unique indexes cannot be targeted by PostgREST's `resolution=ignore-duplicates`; idempotent inserts therefore go through SQL functions with `on conflict … where`.
- API keys: `gtm_` + 48 hex chars, only the SHA-256 is stored, plaintext shown once.
- Demo workspace: `workspaces.is_demo` + hourly sweep of companies older than 24 h; login button appears when `VITE_DEMO_*` are set.
- Skipped on purpose: saved views, workspace switcher, virtualised table (50 rows per page is enough for a demo). Export covers the current page.
- HIG review merged into one pass at the end of Phase 4 instead of two passes (same findings, less churn). Local tooling: Playwright in the scratchpad takes the screenshots in `docs/screenshots/`.
- Deno is not installed on the build machine (no Homebrew); `deno check` of the edge functions runs in CI only.

## 2026-11-05
- Cloudflare Pages project `gtm-toolkit` created with wrangler (the dashboard Git integration is not needed); `deploy-pages.yml` builds and uploads on push. Odoo containers removed from the dev machine, local Supabase has the memory it needs again.
- Renamed to GTM (Go-to-Market): repo `meryemturkmen/gtm`, Pages project `gtm-toolkit`, webhook header `x-gtm-signature`, API key prefix `gtm_` via migration 20261105000001. Migrations already applied were not edited.
- AI runs are no longer cached (were 7 days): AI columns are on demand, and a changed prompt or ICP must re-score. Default ICP prompt treats unknown facts as neutral (migration 20261105000002).
- Design pass (apple-design skill): controls are monochrome ink, colour belongs to the data (status dots, logos, one indigo hue for the ICP score). Mono type for identifiers, 22px page titles, sidebar with symbols and live engine status, Overview without tiles (stat line, segmented pipeline bar, coverage list), record header with the fit score at full size. Fit score column sits next to the domain. Screenshots regenerated from the cloud demo workspace.
- Frontend now deploys from GitHub Actions (`Deploy Pages`, wrangler 3 pinned: wrangler 4 delegates `pages` commands to Workers and fails in CI). Secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, VITE_SUPABASE_*, VITE_DEMO_*. Every push now updates Supabase and Pages without manual steps.
- Interview polish: demo GIF in the README (recorded with Playwright against the demo workspace, encoded with gifenc, no ffmpeg needed), "Why not Clay?" section, pgTAP test for RLS (`supabase/tests/rls.test.sql`, CI job `rls` on `supabase db start`), sortable columns (PostgREST order on `props->>key`, numeric on `props->icp_score->score`), saved views (`saved_views` table: search + sort + minimum fit), bulk actions on selected rows (run a column, create deals), inbound API limited to 60 calls per key per minute (`api_key_hits`), demo sweep keeps `workspaces.demo_seed`. Demo workspace runs Summary and ICP Score automatically so pasted domains get scored.
- Sign-in page: two columns, the product on the left as a replaying preview (cells arrive one by one, dots turn from running to done, the playbook line lands last; reduced motion shows the final state), the form on the right with the demo entry separated. No logo, no gradient, no illustration: the table is the brand.
