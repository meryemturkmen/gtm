import type { Provider } from './kit.ts'
import type { AiConfig } from '../types.ts'

/** Fills {{key}} from vars; objects are inlined as JSON, missing keys become "unknown". */
export function render(template: string, vars: Record<string, unknown>) {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key: string) => {
    const v = vars[key]
    if (v == null || v === '') return 'unknown'
    return typeof v === 'string' ? v : JSON.stringify(v)
  })
}

const SYSTEM = 'You are a precise B2B go-to-market research assistant. Use only the facts given. ' +
  'If something is unknown, say so inside the JSON rather than guessing. Reply with JSON only.'

/** Calls any OpenAI-compatible chat endpoint with a JSON schema and returns the parsed object. */
export const ai: Provider = {
  name: 'ai',
  fields: [],
  cacheHours: 0, // AI columns run on demand; a changed prompt or ICP must produce a fresh answer
  async run(ctx) {
    const cfg = ctx.property.config as AiConfig
    const base = ctx.env.QWEN_BASE_URL, key = ctx.env.QWEN_API_KEY, model = ctx.env.QWEN_MODEL
    if (!base || !key || !model) throw new Error('AI is not configured (QWEN_BASE_URL, QWEN_API_KEY, QWEN_MODEL)')

    const prompt = render(cfg.prompt, { ...ctx.props, domain: ctx.domain, icp: ctx.icp })
    const res = await ctx.fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
        response_format: { type: 'json_schema', json_schema: { name: 'cell', schema: cfg.schema, strict: true } },
      }),
    })
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = await res.json() as {
      choices: { message: { content: string } }[]
      usage?: { total_tokens?: number }
    }
    const content = json.choices[0]?.message.content ?? ''
    let data: Record<string, unknown>
    try { data = JSON.parse(content) } catch { throw new Error(`LLM returned non-JSON: ${content.slice(0, 120)}`) }
    const tokens = Math.round(json.usage?.total_tokens ?? 0)
    const perMillion = Number(ctx.env.QWEN_COST_PER_MILLION_CENTS ?? 0)
    return { data: { ...data, _prompt: prompt }, tokens, cost_cents: (tokens / 1_000_000) * perMillion }
  },
}
