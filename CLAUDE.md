# GMT — working rules for AI agents

GMT is an open-source Go-to-Market toolkit: Clay-style enrichment tables and a HubSpot-style CRM core on one data model.
Read `docs/LOG.md` (decisions, state) before changing anything. Append to it when you decide something.

## Style

- Lazy senior dev (`/ponytail`): the smallest change that fully solves the task. No abstractions, options or "for later" code nobody asked for. Reuse what exists in `src/`, `shared/`, `supabase/`.
- UI follows Apple's Human Interface Guidelines (`/apple-design` reviews each UI phase): system font, dense 13px tables, subtle separators, sheets over modals, real empty/loading/error states, dark mode.
- English everywhere: UI, README, comments, commit messages.
- Non-trivial logic ships with a Vitest test next to it (`*.test.ts`). Providers are tested against HTML fixtures, never the network.

## Architecture (see `docs/adr/`)

- `src/` Vite + React + TanStack Router/Query. Talks to Supabase directly (RLS is the authorization layer).
- `shared/` pure TypeScript used by both the browser and Deno edge functions. Imports use `.ts` extensions. No Node or DOM APIs.
- `supabase/migrations/` is the schema. Never edit an applied migration; add a new one.
- `supabase/functions/run-jobs` is the enrichment engine: claims `jobs`, runs providers, writes `companies.props` and `runs`, evaluates playbooks.
- Columns are rows in `properties`; values live in `companies.props[key]`. An enrichment is a property with `source = 'provider'`; an AI column is `source = 'ai'`.

## Secrets

Never commit keys. Browser gets only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Edge functions read `QWEN_BASE_URL`, `QWEN_API_KEY`, `QWEN_MODEL` from Supabase secrets.

## Commands

```
npm run dev          # Vite on :5173
npm test             # Vitest
npm run typecheck    # tsc -b
npx supabase start   # local stack (Docker)
npx supabase db reset
npx supabase functions serve
```
