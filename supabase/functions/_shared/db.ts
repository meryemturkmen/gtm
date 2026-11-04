// Minimal PostgREST client for the worker. Plain fetch: no SDK to bundle, runs in Deno, Node and tests.

export type Db = {
  select: <T>(table: string, query: string) => Promise<T[]>
  insert: <T>(table: string, rows: object | object[], opts?: { returning?: boolean; ignoreDuplicates?: boolean }) => Promise<T[]>
  update: (table: string, query: string, patch: object) => Promise<void>
  rpc: <T>(fn: string, args: object) => Promise<T>
}

export function makeDb(url: string, serviceKey: string, fetchImpl: typeof fetch = fetch): Db {
  async function call(path: string, init: RequestInit & { prefer?: string } = {}) {
    const res = await fetchImpl(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
        ...(init.prefer ? { prefer: init.prefer } : {}),
      },
    })
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }
  return {
    select: (table, query) => call(`${table}?${query}`),
    insert: (table, rows, { returning = true, ignoreDuplicates = false } = {}) =>
      call(table, {
        method: 'POST', body: JSON.stringify(rows),
        prefer: [returning ? 'return=representation' : 'return=minimal', ignoreDuplicates ? 'resolution=ignore-duplicates' : '']
          .filter(Boolean).join(','),
      }).then(r => r ?? []),
    update: (table, query, patch) =>
      call(`${table}?${query}`, { method: 'PATCH', body: JSON.stringify(patch), prefer: 'return=minimal' }),
    rpc: (fn, args) => call(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }),
  }
}
