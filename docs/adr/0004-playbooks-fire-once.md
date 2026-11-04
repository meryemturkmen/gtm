# ADR 0004: Playbooks fire once per company, from the worker, after a cell write

**Status:** accepted · 2026-11-04

## Context

HubSpot-style workflows react to property changes. In GMT most property changes are produced by the enrichment worker, and re-running an enrichment must not create a second deal or fire a second webhook.

## Decision

A playbook has one trigger column, one condition and an ordered list of actions. The worker evaluates playbooks right after it writes a cell with status `done`. Before running actions it inserts a `playbook_runs` row; a partial unique index on `(playbook_id, company_id) where matched` makes the second attempt fail, which the worker treats as "already fired". Non-matching evaluations are logged too, so the Playbooks page can show "condition not met" instead of silence.

Actions are deliberately few: create a deal (idempotent per company and title), run more columns, call a signed webhook, set a column. Anything else belongs in the receiving system, which is what the webhook is for.

## Consequences

- No separate workflow engine; the enrichment worker is the only place that mutates on a schedule.
- Hand-typed input columns do not trigger playbooks (they do not go through the worker). Acceptable for now; a database trigger could enqueue a synthetic job if that is ever needed.
- Webhook payloads carry the full `props`, signed with HMAC-SHA256 under `x-gmt-signature`, so n8n, Zapier or a custom receiver can verify them.
