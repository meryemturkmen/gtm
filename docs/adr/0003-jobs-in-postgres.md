# ADR 0003: The job queue is a Postgres table

**Status:** accepted · 2026-11-04

## Context

Enrichment runs are slow (HTTP fetches, LLM calls), must retry, and must be visible per cell. A hosted queue (SQS, Inngest, Cloudflare Queues) adds a vendor and hides state from the UI.

## Decision

`jobs(company_id, property_key, status, attempts, run_after)` is the queue. A partial unique index prevents duplicate queued jobs per cell. `claim_jobs(n)` does `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)` so several workers never pick the same job. The `run-jobs` edge function is the worker: `pg_cron` calls it every minute and the UI calls it right after enqueueing so a demo feels instant. Failures retry with backoff up to 3 attempts; AI jobs whose inputs are still empty enqueue those inputs and requeue themselves.

## Consequences

- Job state is a normal table: the UI subscribes to it with Realtime to show spinners and errors per cell.
- Throughput is bounded by edge-function wall time (one batch per invocation); fine for a demo, scalable by running the worker elsewhere since claiming is in SQL.
- No external dependency beyond Supabase.
