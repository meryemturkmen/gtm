// Provider contract and the HTTP helpers every provider shares. Pure TS: runs in Deno and in Vitest.

import type { Property } from '../types.ts'

export type Page = { status: number; url: string; html: string; headers: Record<string, string> }

export type ProviderCtx = {
  domain: string
  props: Record<string, unknown>
  icp: string
  /** The column being filled; AI columns read their prompt and schema from it. */
  property: Property
  env: Record<string, string | undefined>
  fetch: typeof fetch
  /** Homepage, fetched once per company and shared by every provider that needs it. */
  page: () => Promise<Page>
}

export type ProviderOutput = { data: Record<string, unknown>; tokens?: number; cost_cents?: number }

export type Provider = {
  name: string
  /** Output fields a column can pick with "name.field"; shown in the column editor. */
  fields: string[]
  /** How long a run may be reused for other columns of the same company. */
  cacheHours: number
  run: (ctx: ProviderCtx) => Promise<ProviderOutput>
}

const UA = 'Mozilla/5.0 (compatible; GMT/1.0; +https://github.com/meryemturkmen/gmt)'
const MAX_BYTES = 300_000

/** GET with a timeout and a body cap. Throws on network errors, not on HTTP status. */
export async function fetchPage(fetchImpl: typeof fetch, url: string, timeoutMs = 10_000): Promise<Page> {
  const res = await fetchImpl(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': UA, accept: 'text/html,*/*;q=0.8' },
  })
  const html = (await res.text()).slice(0, MAX_BYTES)
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => { headers[k] = v })
  return { status: res.status, url: res.url || url, html, headers }
}

/** Homepage with https first, http as fallback. */
export async function fetchHome(fetchImpl: typeof fetch, domain: string): Promise<Page> {
  try {
    return await fetchPage(fetchImpl, `https://${domain}/`)
  } catch (e) {
    try { return await fetchPage(fetchImpl, `http://${domain}/`) } catch { throw e }
  }
}

