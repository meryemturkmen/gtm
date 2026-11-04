// How a column turns provider output into a cell value.

export const isEmpty = (v: unknown) =>
  v == null || v === '' || (Array.isArray(v) && v.length === 0)

/** "website_meta.description" → provider "website_meta", field "description". "logo" → whole output. */
export function parseSpec(spec: string) {
  const dot = spec.indexOf('.')
  return dot === -1 ? { provider: spec, field: null } : { provider: spec.slice(0, dot), field: spec.slice(dot + 1) }
}

export function pick(data: Record<string, unknown>, field: string | null) {
  return field === null ? data : data[field]
}

/** An AI schema with exactly one property unwraps to that property, so a "score" column holds 81, not {score: 81}. */
export function unwrapAi(data: Record<string, unknown>, schema: Record<string, unknown>) {
  const props = Object.keys((schema.properties as Record<string, unknown> | undefined) ?? {})
  const clean = Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith('_')))
  return props.length === 1 ? clean[props[0]!] : clean
}

/** Ready-made schemas for the column editor. */
export const aiSchemas = {
  text: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
  score: {
    type: 'object',
    properties: { score: { type: 'integer', minimum: 0, maximum: 100 }, reason: { type: 'string' } },
    required: ['score', 'reason'], additionalProperties: false,
  },
  boolean: {
    type: 'object',
    properties: { answer: { type: 'boolean' }, reason: { type: 'string' } },
    required: ['answer', 'reason'], additionalProperties: false,
  },
} as const
