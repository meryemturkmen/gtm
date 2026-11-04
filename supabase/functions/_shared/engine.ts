// The enrichment worker (ADR 0003). Claims due jobs, runs providers, writes cells, logs runs.
// Runtime-agnostic: the edge function and the local Node worker both call runBatch().

import { fetchHome, providers, type Page, type ProviderCtx } from './providers/index.ts'
import { isEmpty, parseSpec, pick, unwrapAi } from './waterfall.ts'
import type { Db } from './db.ts'
import { matches, sign, type Action, type Condition } from './playbooks.ts'
import type { AiConfig, CellMeta, Company, Job, Property, ProviderConfig } from './types.ts'

export const BATCH = 8
const MAX_ATTEMPTS = 3
const WAIT_FOR_INPUTS_MS = 30_000

export type Engine = { db: Db; env: Record<string, string | undefined>; fetch: typeof fetch }

/** Per-batch caches: one homepage fetch per domain, one provider run per company and provider. */
type Shared = { pages: Map<string, Promise<Page>>; runs: Map<string, Promise<RunResult>> }
type RunResult = { id: string; output: Record<string, unknown> }

/** Claims up to BATCH jobs and processes them concurrently. Returns what happened. */
export async function runBatch(engine: Engine) {
  const jobs = await engine.db.rpc<Job[]>('claim_jobs', { n: BATCH })
  const shared: Shared = { pages: new Map(), runs: new Map() }
  const results = await Promise.allSettled(jobs.map(job => processJob(engine, job, shared)))
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map(r => String(r.reason))
  return { processed: jobs.length, failed, more: jobs.length === BATCH }
}

async function processJob({ db, env, fetch }: Engine, job: Job, shared: Shared) {
  try {
    const [[company], [property], [workspace]] = await Promise.all([
      db.select<Company>('companies', `id=eq.${job.company_id}&select=*`),
      db.select<Property>('properties', `workspace_id=eq.${job.workspace_id}&key=eq.${job.property_key}&select=*`),
      db.select<{ icp: string }>('workspaces', `id=eq.${job.workspace_id}&select=icp`),
    ])
    if (!company) throw new Error('company no longer exists')
    if (!property) { await finish(db, job, 'failed', 'column no longer exists'); return }

    const ctx: ProviderCtx = {
      domain: company.domain,
      props: company.props,
      icp: workspace?.icp ?? '',
      property,
      env,
      fetch,
      page: () => {
        if (!shared.pages.has(company.domain)) shared.pages.set(company.domain, fetchHome(fetch, company.domain))
        return shared.pages.get(company.domain)!
      },
    }
    if (property.source === 'ai') await runAi(db, job, company, property, ctx, shared)
    else await runWaterfall(db, job, company, property, ctx, shared)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (job.attempts < MAX_ATTEMPTS) {
      await db.update('jobs', `id=eq.${job.id}`, {
        status: 'queued', last_error: message, run_after: new Date(Date.now() + 30_000 * job.attempts).toISOString(),
      })
    } else {
      await setCell(db, job, null, { status: 'failed', provider: '', at: now(), error: message })
      await finish(db, job, 'failed', message)
    }
    throw new Error(`${job.property_key}@${job.company_id}: ${message}`)
  }
}

async function runWaterfall(db: Db, job: Job, company: Company, property: Property, ctx: ProviderCtx, shared: Shared) {
  const specs = (property.config as ProviderConfig).providers ?? []
  let last = ''
  for (const spec of specs) {
    const { provider, field } = parseSpec(spec)
    last = provider
    const run = await execute(db, job, company, provider, provider, ctx, shared)
    const value = pick(run.output, field)
    if (!isEmpty(value)) {
      await setCell(db, job, value, { status: 'done', provider: spec, run_id: run.id, at: now() })
      await finish(db, job, 'done')
      await runPlaybooks(db, ctx, job, company, value)
      return
    }
  }
  await setCell(db, job, null, { status: 'empty', provider: last, at: now() })
  await finish(db, job, 'done')
}

async function runAi(db: Db, job: Job, company: Company, property: Property, ctx: ProviderCtx, shared: Shared) {
  const cfg = property.config as AiConfig
  // Inputs the prompt needs that nobody has filled yet: enrich them first, come back later.
  const uses = cfg.uses ?? []
  const inputs = uses.length
    ? await db.select<{ key: string; source: string }>('properties', `workspace_id=eq.${job.workspace_id}&key=in.(${uses.join(',')})&select=key,source`)
    : []
  const missing = inputs.filter(p => p.source !== 'input' && !company.meta[p.key] && isEmpty(company.props[p.key])).map(p => p.key)
  if (missing.length) {
    // Waiting is not a failed attempt: inputs always settle (each provider job ends done, empty or failed).
    await db.rpc('enqueue_jobs', { p_company: job.company_id, p_keys: missing })
    await db.update('jobs', `id=eq.${job.id}`, { status: 'queued', attempts: job.attempts - 1, run_after: new Date(Date.now() + WAIT_FOR_INPUTS_MS).toISOString() })
    return
  }
  const run = await execute(db, job, company, 'ai', `ai:${property.key}`, ctx, shared)
  const value = unwrapAi(run.output, cfg.schema)
  const empty = isEmpty(value)
  await setCell(db, job, empty ? null : value, { status: empty ? 'empty' : 'done', provider: 'ai', run_id: run.id, at: now() })
  await finish(db, job, 'done')
  if (!empty) await runPlaybooks(db, ctx, job, company, value)
}

/** Runs a provider once per batch and company, or reuses a recent successful run. Always leaves a `runs` row behind. */
function execute(db: Db, job: Job, company: Company, providerName: string, cacheKey: string, ctx: ProviderCtx, shared: Shared) {
  const key = `${company.id}:${cacheKey}`
  if (!shared.runs.has(key)) shared.runs.set(key, executeOnce(db, job, company, providerName, cacheKey, ctx))
  return shared.runs.get(key)!
}

async function executeOnce(db: Db, job: Job, company: Company, providerName: string, cacheKey: string, ctx: ProviderCtx): Promise<RunResult> {
  const provider = providers[providerName]
  if (!provider) throw new Error(`unknown provider "${providerName}"`)

  const since = new Date(Date.now() - provider.cacheHours * 3_600_000).toISOString()
  const [cached] = await db.select<{ id: string; output: Record<string, unknown> }>('runs',
    `company_id=eq.${company.id}&provider=eq.${encodeURIComponent(cacheKey)}&status=eq.done&created_at=gte.${since}&order=created_at.desc&limit=1&select=id,output`)
  if (cached) return cached

  const started = Date.now()
  const base = { workspace_id: job.workspace_id, company_id: company.id, provider: cacheKey, input: { domain: company.domain, property: job.property_key } }
  try {
    const out = await provider.run(ctx)
    const [row] = await db.insert<{ id: string }>('runs', {
      ...base, status: 'done', output: out.data, tokens: out.tokens ?? 0, cost_cents: out.cost_cents ?? 0, duration_ms: Date.now() - started,
    })
    return { id: row!.id, output: out.data }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db.insert('runs', { ...base, status: 'failed', error: message, duration_ms: Date.now() - started }, { returning: false })
    throw new Error(`${providerName}: ${message}`)
  }
}

type Playbook = { id: string; name: string; condition: Condition; actions: Action[] }

/** Fires every enabled playbook listening on this column. Each fires at most once per company (unique index). */
async function runPlaybooks(db: Db, ctx: ProviderCtx, job: Job, company: Company, value: unknown) {
  const playbooks = await db.select<Playbook>('playbooks',
    `workspace_id=eq.${job.workspace_id}&trigger_key=eq.${job.property_key}&enabled=is.true&select=id,name,condition,actions`)
  for (const pb of playbooks) {
    const matched = matches(pb.condition, value)
    const base = { workspace_id: job.workspace_id, playbook_id: pb.id, company_id: company.id, matched }
    if (!matched) { await db.insert('playbook_runs', base, { returning: false }); continue }
    // Claim the once-per-company slot first; a duplicate insert means another run already fired it.
    try { await db.insert('playbook_runs', { ...base, result: [] }, { returning: false }) } catch { continue }
    const result: unknown[] = []
    let error: string | null = null
    try {
      for (const a of pb.actions) result.push(await runAction(db, ctx, job, company, a, value))
    } catch (e) { error = e instanceof Error ? e.message : String(e) }
    await db.update('playbook_runs', `playbook_id=eq.${pb.id}&company_id=eq.${company.id}&matched=is.true`, { result, error })
    await db.insert('activities', {
      workspace_id: job.workspace_id, company_id: company.id, kind: 'system',
      body: error ? `Playbook "${pb.name}" failed: ${error}` : `Playbook "${pb.name}" fired on ${job.property_key}`,
      meta: { playbook_id: pb.id, property_key: job.property_key, result },
    }, { returning: false })
  }
}

async function runAction(db: Db, ctx: ProviderCtx, job: Job, company: Company, a: Action, value: unknown) {
  switch (a.type) {
    case 'create_deal': {
      const title = a.title.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k: string) => String(company.props[k] ?? company.domain))
      const id = await db.rpc<string>('playbook_create_deal', { p_company: company.id, p_stage: a.stage_id, p_title: title })
      return { type: a.type, deal_id: id }
    }
    case 'set_property':
      await db.rpc('set_cell', { p_company: company.id, p_key: a.key, p_value: a.value, p_meta: { status: 'done', provider: 'playbook', at: now() } })
      return { type: a.type, key: a.key }
    case 'enqueue':
      await db.rpc('enqueue_jobs', { p_company: company.id, p_keys: a.keys })
      return { type: a.type, keys: a.keys }
    case 'webhook': {
      assertPublicHttps(a.url)
      const body = JSON.stringify({ event: 'playbook', property: job.property_key, value, company: { id: company.id, domain: company.domain, props: company.props }, at: now() })
      const secret = ctx.env.WEBHOOK_SECRET ?? ''
      const res = await ctx.fetch(a.url, {
        method: 'POST', body, signal: AbortSignal.timeout(10_000),
        headers: { 'content-type': 'application/json', 'x-gmt-signature': secret ? await sign(secret, body) : 'unsigned' },
      })
      return { type: a.type, status: res.status }
    }
  }
}

/** Webhooks may only reach public HTTPS hosts; the worker must never be turned into a proxy into the backend network. */
export function assertPublicHttps(url: string) {
  let u: URL
  try { u = new URL(url) } catch { throw new Error(`webhook url is not a URL: ${url}`) }
  const host = u.hostname.toLowerCase()
  const privateHost = host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')
    || /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.startsWith('[')
  if (u.protocol !== 'https:' || privateHost) throw new Error(`webhook url must be a public https address: ${url}`)
}

const setCell = (db: Db, job: Job, value: unknown, meta: CellMeta) =>
  db.rpc('set_cell', { p_company: job.company_id, p_key: job.property_key, p_value: value, p_meta: meta })

const finish = (db: Db, job: Job, status: 'done' | 'failed', last_error: string | null = null) =>
  db.update('jobs', `id=eq.${job.id}`, { status, last_error })

const now = () => new Date().toISOString()
