import { expect, it } from 'vitest'
import { assertPublicHttps, runBatch, type Engine } from './engine.ts'
import type { Db } from './db.ts'

/** Just enough of PostgREST in memory to drive one batch: a workspace, a company, two columns, one playbook. */
function fakeDb() {
  const company = { id: 'c1', workspace_id: 'w1', domain: 'acme.de', props: {} as Record<string, unknown>, meta: {} as Record<string, unknown> }
  const properties = [
    { id: 'p1', workspace_id: 'w1', key: 'name', label: 'Name', type: 'text', source: 'provider', config: { providers: ['logo.missing', 'website_meta.name'] }, position: 1 },
    { id: 'p2', workspace_id: 'w1', key: 'score', label: 'Score', type: 'json', source: 'ai', config: { prompt: 'Rate {{name}}', schema: { type: 'object', properties: { score: { type: 'integer' } } }, uses: ['name'] }, position: 2 },
  ]
  const jobs = [
    { id: 'j1', workspace_id: 'w1', company_id: 'c1', property_key: 'name', status: 'queued', attempts: 1 },
    { id: 'j2', workspace_id: 'w1', company_id: 'c1', property_key: 'score', status: 'queued', attempts: 1 },
  ]
  const runs: Record<string, unknown>[] = []
  const playbookRuns: Record<string, unknown>[] = []
  const activities: Record<string, unknown>[] = []
  const calls: string[] = []
  const db: Db = {
    async select(table, query) {
      if (table === 'companies') return [company] as never
      if (table === 'properties') {
        const key = query.match(/key=eq\.([a-z_]+)/)?.[1]
        const keys = query.match(/key=in\.\(([^)]*)\)/)?.[1]?.split(',')
        return properties.filter(p => key ? p.key === key : keys ? keys.includes(p.key) : true) as never
      }
      if (table === 'workspaces') return [{ icp: 'DACH B2B' }] as never
      if (table === 'runs') return [] as never
      if (table === 'playbooks') return (query.includes('trigger_key=eq.score') ? [{ id: 'pb', name: 'High score', condition: { op: 'gte', value: 70 }, actions: [{ type: 'enqueue', keys: ['first_line'] }] }] : []) as never
      throw new Error(`unexpected select ${table}`)
    },
    async insert(table, rows) {
      const list = table === 'runs' ? runs : table === 'playbook_runs' ? playbookRuns : table === 'activities' ? activities : null
      if (!list) throw new Error(`unexpected insert ${table}`)
      for (const r of Array.isArray(rows) ? rows : [rows]) list.push({ id: `${table}-${list.length + 1}`, ...r as object })
      return [{ id: `${table}-${list.length}` }] as never
    },
    async update(table, query, patch) {
      calls.push(`update ${table} ${query} ${JSON.stringify(patch)}`)
      if (table === 'jobs') Object.assign(jobs.find(j => query.includes(j.id))!, patch)
    },
    async rpc(fn, args) {
      calls.push(`rpc ${fn} ${JSON.stringify(args)}`)
      if (fn === 'claim_jobs') return jobs.filter(j => j.status === 'queued').map(j => ({ ...j, status: 'running' })) as never
      if (fn === 'set_cell') {
        const a = args as { p_key: string; p_value: unknown; p_meta: unknown }
        company.props[a.p_key] = a.p_value; company.meta[a.p_key] = a.p_meta
        return null as never
      }
      if (fn === 'enqueue_jobs') return 1 as never
      throw new Error(`unexpected rpc ${fn}`)
    },
  }
  return { db, company, jobs, runs, playbookRuns, activities, calls }
}

const fetchStub = (async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url).includes('chat/completions')) {
    expect(String(init?.body)).toContain('Rate Acme GmbH')
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"score": 88}' } }], usage: { total_tokens: 50 } }))
  }
  return new Response('<html><head><title>Acme GmbH | Pumps</title></head></html>', { status: 200 })
}) as typeof fetch

it('fills a waterfall cell, waits for AI inputs, then scores and fires the playbook', async () => {
  const f = fakeDb()
  const engine: Engine = { db: f.db, fetch: fetchStub, env: { QWEN_BASE_URL: 'https://llm/v1', QWEN_API_KEY: 'k', QWEN_MODEL: 'm' } }

  // Batch 1: both jobs claimed. "name" resolves via the second provider; "score" sees name missing and waits.
  const first = await runBatch(engine)
  expect(first.failed).toEqual([])
  expect(f.company.props.name).toBe('Acme GmbH')
  expect(f.company.meta.name).toMatchObject({ status: 'done', provider: 'website_meta.name' })
  expect(f.runs.map(r => [r.provider, r.status])).toEqual([['logo', 'done'], ['website_meta', 'done']])
  expect(f.jobs[1]).toMatchObject({ status: 'queued', attempts: 0 })
  expect(f.calls).toContain('rpc enqueue_jobs {"p_company":"c1","p_keys":["name"]}')

  // Batch 2: inputs are there, the AI runs, the score unwraps, the playbook fires once.
  f.jobs[0]!.status = 'done'
  const second = await runBatch(engine)
  expect(second.failed).toEqual([])
  expect(f.company.props.score).toBe(88)
  expect(f.runs.at(-1)).toMatchObject({ provider: 'ai:score', tokens: 50 })
  expect(f.playbookRuns).toHaveLength(1)
  expect(f.playbookRuns[0]).toMatchObject({ matched: true })
  expect(f.calls).toContain('rpc enqueue_jobs {"p_company":"c1","p_keys":["first_line"]}')
  expect(f.activities[0]?.body).toBe('Playbook "High score" fired on score')
})

it('requeues with backoff on provider failure and fails the cell after the last attempt', async () => {
  const f = fakeDb()
  f.jobs.splice(1) // only the "name" job
  const failing = (async () => new Response('nope', { status: 503 })) as typeof fetch
  const engine: Engine = { db: f.db, fetch: failing, env: {} }

  await runBatch(engine)
  expect(f.jobs[0]).toMatchObject({ status: 'queued', last_error: expect.stringContaining('HTTP 503') })

  f.jobs[0]!.attempts = 3
  await runBatch(engine)
  expect(f.jobs[0]!.status).toBe('failed')
  expect(f.company.meta.name).toMatchObject({ status: 'failed' })
})

it('refuses webhooks that are not public https', () => {
  expect(() => assertPublicHttps('https://hooks.example.com/x')).not.toThrow()
  for (const bad of ['http://hooks.example.com', 'https://localhost/x', 'https://10.0.0.5/x', 'https://kong/x', 'https://192.168.1.1/x', 'nope'])
    expect(() => assertPublicHttps(bad), bad).toThrow()
})
