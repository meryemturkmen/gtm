// Local worker: the same engine the edge function runs, polling the local Supabase every few seconds.
// Usage: npm run worker   (reads supabase/functions/.env for QWEN_* if present)

import { readFileSync } from 'node:fs'
import { makeDb } from '../supabase/functions/_shared/db.ts'
import { runBatch } from '../supabase/functions/_shared/engine.ts'

const env: Record<string, string | undefined> = { ...process.env }
try {
  for (const line of readFileSync('supabase/functions/.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
  }
} catch { /* no local function secrets, AI columns will report "not configured" */ }

const url = env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing (see `npx supabase status`)')

const engine = { db: makeDb(url, key), env, fetch }
console.log(`worker polling ${url}`)
while (true) {
  const started = Date.now()
  try {
    const r = await runBatch(engine)
    if (r.processed) console.log(`${new Date().toISOString()} processed ${r.processed} in ${Date.now() - started} ms${r.failed.length ? `, failed: ${r.failed.join(' | ')}` : ''}`)
    if (r.more) continue
  } catch (e) {
    console.error('batch failed:', e)
  }
  await new Promise(r => setTimeout(r, 4000))
}
