# ADR 0002: Properties are columns, companies carry the values

**Status:** accepted · 2026-11-04

## Context

Clay models data as tables with enrichment columns; HubSpot models it as objects with properties. GMT wants both views on the same rows without two data models.

## Decision

A column is a row in `properties(key, label, type, source, config)`. `source` is `input` (typed by a human), `provider` (filled by an enrichment provider, possibly a waterfall of several) or `ai` (filled by an LLM prompt that may reference other properties). Values live in `companies.props` as JSON keyed by `properties.key`. Every write to a cell is logged in `runs` with provider, input, output, tokens, cost and duration.

## Consequences

- Adding a column is one insert; no schema migration per property.
- The companies table, the record page and saved views all read the same `props`.
- Querying inside `props` uses JSONB operators; a GIN index on `props` covers filters.
- Provenance is first-class: a cell can always answer "where did this come from and what did it cost".
