// Inbound webhook: POST { "domains": ["acme.de", ...] } with header x-api-key. Returns the created companies.
// Meant for forms, Zapier, n8n or a CRM export: anything that can send JSON.

import { makeDb } from '../_shared/db.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 })
  const key = req.headers.get('x-api-key')
  if (!key) return Response.json({ error: 'missing x-api-key header' }, { status: 401 })

  let body: { domains?: unknown; domain?: unknown }
  try { body = await req.json() } catch { return Response.json({ error: 'body must be JSON' }, { status: 400 }) }
  const domains = (Array.isArray(body.domains) ? body.domains : [body.domain]).filter((d): d is string => typeof d === 'string')
  if (domains.length === 0) return Response.json({ error: 'send "domains": [...] or "domain"' }, { status: 400 })
  if (domains.length > 500) return Response.json({ error: 'max 500 domains per call' }, { status: 413 })

  const db = makeDb(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let workspace: string | null
  try {
    workspace = await db.rpc<string | null>('resolve_api_key', { p_raw: key })
  } catch (err) {
    if (String(err).includes('rate limited')) return Response.json({ error: 'rate limited: 60 calls per minute per key' }, { status: 429 })
    throw err
  }
  if (!workspace) return Response.json({ error: 'invalid api key' }, { status: 401 })

  const rows = await db.rpc<{ id: string; domain: string }[]>('ingest_companies', { p_workspace: workspace, p_domains: domains })
  // Kick the worker so the cells fill before cron gets around to it.
  fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/run-jobs`, {
    method: 'POST', headers: { authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
  }).catch(() => {})
  return Response.json({ created: rows.map(r => ({ id: r.id, domain: r.domain })), skipped: domains.length - rows.length })
})
