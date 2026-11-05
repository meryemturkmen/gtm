# GTM — working rules for AI agents

GTM is an open-source Go-to-Market toolkit: Clay-style enrichment tables and a HubSpot-style CRM core on one data model.
Read `docs/LOG.md` (decisions, state) before changing anything. Append to it when you decide something.

## Style

- Lazy senior dev (`/ponytail`): the smallest change that fully solves the task. No abstractions, options or "for later" code nobody asked for. Reuse what exists in `src/` and `supabase/`.
- UI follows Apple's Human Interface Guidelines (`/apple-design` reviews each UI phase): system font, dense 13px tables, subtle separators, sheets over modals, real empty/loading/error states, dark mode.
- English everywhere: UI, README, comments, commit messages.
- Non-trivial logic ships with a Vitest test next to it (`*.test.ts`). Providers are tested against HTML fixtures, never the network.

## Architecture (see `docs/adr/`)

- `src/` Vite + React + TanStack Router/Query. Talks to Supabase directly (RLS is the authorization layer).
- `supabase/functions/_shared/` pure TypeScript used by both the browser and Deno edge functions (providers, waterfall, schemas). Imports use `.ts` extensions. No Node or DOM APIs.
- `supabase/migrations/` is the schema. Never edit an applied migration; add a new one.
- `supabase/functions/_shared/engine.ts` is the enrichment engine: claims `jobs`, runs providers, writes `companies.props` and `runs`. `run-jobs` (edge function) and `scripts/worker.ts` (local Node) are thin wrappers around it.
- Columns are rows in `properties`; values live in `companies.props[key]`. An enrichment is a property with `source = 'provider'`; an AI column is `source = 'ai'`.

## Secrets

Never commit keys. Browser gets only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Edge functions read `QWEN_BASE_URL`, `QWEN_API_KEY`, `QWEN_MODEL` and `WEBHOOK_SECRET` from Supabase secrets. The demo login credentials in `VITE_DEMO_*` are public by design (workspace flagged is_demo, swept hourly).

## Commands

```
npm run dev          # Vite on :5173
npm test             # Vitest
npm run typecheck    # tsc -b
npx supabase start   # local stack (Docker)
npx supabase db reset
npm run worker        # local engine (Node), same code as the edge function
```
