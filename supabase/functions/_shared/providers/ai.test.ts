import { expect, it } from 'vitest'
import { ai, render } from './ai.ts'
import type { ProviderCtx } from './index.ts'

it('renders props, inlines objects, marks unknowns', () => {
  expect(render('{{name}} uses {{tech_stack}}; hq {{city}}', { name: 'Acme', tech_stack: ['Shopify'] }))
    .toBe('Acme uses ["Shopify"]; hq unknown')
})

it('posts a json_schema request and returns the parsed object with usage', async () => {
  let body: Record<string, unknown> = {}
  const fetchStub = (async (_url: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"score": 81, "reason": "fits"}' } }],
      usage: { total_tokens: 400 },
    }))
  }) as typeof fetch
  const ctx = {
    domain: 'acme.de', icp: 'DACH B2B', props: { name: 'Acme' }, fetch: fetchStub,
    env: { QWEN_BASE_URL: 'https://llm/v1/', QWEN_API_KEY: 'k', QWEN_MODEL: 'm', QWEN_COST_PER_MILLION_CENTS: '100' },
    property: { config: { prompt: 'Score {{name}} against {{icp}}', schema: { type: 'object' }, uses: ['name'] } },
  } as unknown as ProviderCtx
  const out = await ai.run(ctx)
  expect(body.model).toBe('m')
  expect((body.messages as { content: string }[])[1]?.content).toBe('Score Acme against DACH B2B')
  expect(out.data).toMatchObject({ score: 81, reason: 'fits' })
  expect(out.tokens).toBe(400)
  expect(out.cost_cents).toBeCloseTo(0.04)
})

it('fails clearly when not configured', async () => {
  await expect(ai.run({ env: {}, property: { config: {} } } as unknown as ProviderCtx)).rejects.toThrow(/not configured/)
})
