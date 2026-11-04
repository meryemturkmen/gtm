// The enrichment worker (ADR 0003). Claims due jobs, runs providers, writes cells, logs runs.
// Runtime-agnostic: the edge function and the local Node worker both call runBatch().

import { fetchHome, providers, type Page, type ProviderCtx } from './providers/index.ts'
import { isEmpty, parseSpec, pick, unwrapAi } from './waterfall.ts'
import type { Db } from './db.ts'
import type { AiConfig, CellMeta, Company, Job, Property, ProviderConfig } from './types.ts'

export const BATCH = 8
const MAX_ATTEMPTS = 3
const WAIT_FOR_INPUTS_MS = 15_000

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
    if (job.attempts >= MAX_ATTEMPTS) throw new Error(`inputs never arrived: ${missing.join(', ')}`)
    await db.insert('jobs', missing.map(key => ({ workspace_id: job.workspace_id, company_id: job.company_id, property_key: key })),
      { returning: false, ignoreDuplicates: true })
    await db.update('jobs', `id=eq.${job.id}`, { status: 'queued', run_after: new Date(Date.now() + WAIT_FOR_INPUTS_MS).toISOString() })
    return
  }
  const run = await execute(db, job, company, 'ai', `ai:${property.key}`, ctx, shared)
  const value = unwrapAi(run.output, cfg.schema)
  const empty = isEmpty(value)
  await setCell(db, job, empty ? null : value, { status: empty ? 'empty' : 'done', provider: 'ai', run_id: run.id, at: now() })
  await finish(db, job, 'done')
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

const setCell = (db: Db, job: Job, value: unknown, meta: CellMeta) =>
  db.rpc('set_cell', { p_company: job.company_id, p_key: job.property_key, p_value: value, p_meta: meta })

const finish = (db: Db, job: Job, status: 'done' | 'failed', last_error: string | null = null) =>
  db.update('jobs', `id=eq.${job.id}`, { status, last_error })

const now = () => new Date().toISOString()
