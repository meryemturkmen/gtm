import { expect, it } from 'vitest'
import { classifyMx, emailProvider, mxHost } from './email_provider.ts'
import type { ProviderCtx } from './index.ts'

it('maps MX hosts to a provider', () => {
  expect(classifyMx(['aspmx.l.google.com'])).toBe('Google Workspace')
  expect(classifyMx(['acme-de.mail.protection.outlook.com'])).toBe('Microsoft 365')
  expect(classifyMx(['mail.acme.de'])).toBe('Self-hosted / other')
  expect(classifyMx([])).toBeNull()
})

it('strips priority and trailing dot from DNS answers', () => {
  expect(mxHost('10 aspmx.l.google.com.')).toBe('aspmx.l.google.com')
})

it('queries DNS over HTTPS and classifies the answer', async () => {
  const fetchStub = (async (url: string | URL | Request) => {
    expect(String(url)).toContain('name=acme.de&type=MX')
    return new Response(JSON.stringify({ Answer: [{ type: 15, data: '10 aspmx.l.google.com.' }] }))
  }) as typeof fetch
  const out = await emailProvider.run({ domain: 'acme.de', fetch: fetchStub } as ProviderCtx)
  expect(out.data).toEqual({ provider: 'Google Workspace', mx: ['aspmx.l.google.com'], has_mx: true })
})
