// Edge-function wrapper around the engine. Invoked by pg_cron every minute and by the UI after it enqueues work.
// The gateway already verified the JWT; any member may poke the worker, it only acts on claimed jobs.

import { makeDb } from '../_shared/db.ts'
import { runBatch } from '../_shared/engine.ts'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void }

Deno.serve(async (req) => {
  const url = Deno.env.get('SUPABASE_URL')!
  const engine = { db: makeDb(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), env: Deno.env.toObject(), fetch }
  const result = await runBatch(engine)
  // More might be waiting: keep draining in the background instead of waiting for cron.
  if (result.more && typeof EdgeRuntime !== 'undefined') {
    EdgeRuntime.waitUntil(fetch(`${url}/functions/v1/run-jobs`, {
      method: 'POST', headers: { authorization: req.headers.get('authorization') ?? '' },
    }))
  }
  return Response.json(result)
})
