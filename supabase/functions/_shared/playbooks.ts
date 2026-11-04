// Playbook conditions: evaluated against the cell value that just changed. Pure, tested.

export type Condition =
  | { op: 'any' }
  | { op: 'eq' | 'neq'; value: unknown }
  | { op: 'gte' | 'lte' | 'gt' | 'lt'; value: number }
  | { op: 'contains' | 'not_contains'; value: string }
  | { op: 'empty' | 'not_empty' }

export const conditionOps: { op: Condition['op']; label: string; needsValue: boolean }[] = [
  { op: 'any', label: 'has any value', needsValue: false },
  { op: 'gte', label: 'is at least', needsValue: true },
  { op: 'lte', label: 'is at most', needsValue: true },
  { op: 'eq', label: 'equals', needsValue: true },
  { op: 'neq', label: 'does not equal', needsValue: true },
  { op: 'contains', label: 'contains', needsValue: true },
  { op: 'not_contains', label: 'does not contain', needsValue: true },
  { op: 'empty', label: 'is empty', needsValue: false },
  { op: 'not_empty', label: 'is not empty', needsValue: false },
]

/** Numbers hide in AI answers ({score: 81}) and booleans in {answer: true}; comparisons look through that. */
export function scalar(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>
    if ('score' in o) return o.score
    if ('answer' in o) return o.answer
    if ('text' in o) return o.text
  }
  return value
}

export function matches(condition: Condition, raw: unknown): boolean {
  const v = scalar(raw)
  const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0)
  switch (condition.op) {
    case 'any': return !empty
    case 'empty': return empty
    case 'not_empty': return !empty
    case 'eq': return String(v) === String(condition.value)
    case 'neq': return String(v) !== String(condition.value)
    case 'gte': return Number(v) >= condition.value
    case 'lte': return Number(v) <= condition.value
    case 'gt': return Number(v) > condition.value
    case 'lt': return Number(v) < condition.value
    case 'contains':
    case 'not_contains': {
      const hay = Array.isArray(raw) ? raw.map(String) : [String(v)]
      const hit = hay.some(h => h.toLowerCase().includes(String(condition.value).toLowerCase()))
      return condition.op === 'contains' ? hit : !hit
    }
  }
}

export type Action =
  | { type: 'create_deal'; stage_id: string; title: string }
  | { type: 'webhook'; url: string }
  | { type: 'set_property'; key: string; value: unknown }
  | { type: 'enqueue'; keys: string[] }

/** HMAC-SHA256 signature for outbound webhooks (Web Crypto: works in Deno, Node and browsers). */
export async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}
