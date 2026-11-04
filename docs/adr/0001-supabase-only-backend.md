# ADR 0001: Supabase is the whole backend

**Status:** accepted · 2026-11-04

## Context

GMT needs auth, a relational store with realtime updates, background jobs for enrichment, and a public API. It must run for free and be reproducible from the repo.

## Decision

Use Supabase for everything server-side: Postgres with Row Level Security as the authorization layer, Auth (magic link), Realtime for live cells, Edge Functions for the job engine and inbound webhooks, `pg_cron` + `pg_net` as the scheduler. The browser talks to PostgREST directly; there is no custom API server. The frontend is a static Vite build on Cloudflare Pages.

## Consequences

- One vendor, one config, one migration history in `supabase/migrations/`.
- PostgREST *is* the public API; RLS policies are the only authorization code, so they are tested.
- Edge functions run on Deno: shared logic in `shared/` must stay free of Node and DOM APIs.
- Supabase Branching/GitHub integration is a paid feature, so deploys run from GitHub Actions with the CLI.
