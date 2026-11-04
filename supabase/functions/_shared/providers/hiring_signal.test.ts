import { expect, it } from 'vitest'
import { countJobLinks, findCareersLink, hiringSignal } from './hiring_signal.ts'
import type { ProviderCtx } from './index.ts'

it('counts job-looking links', () => {
  const html = `<a href="/jobs/sales-manager">Sales Manager (m/w/d)</a>
    <a href="/about">About</a> <a href="/karriere/dev">Developer</a>`
  expect(countJobLinks(html)).toBe(2)
})

it('resolves the careers link relative to the homepage', () => {
  expect(findCareersLink('<a href="/de/karriere">Karriere</a>', 'https://acme.de/')).toBe('https://acme.de/de/karriere')
  expect(findCareersLink('<a href="/about">About</a>', 'https://acme.de/')).toBeNull()
})

it('follows the careers page and reports hiring', async () => {
  const pages: Record<string, string> = {
    'https://acme.de/karriere': '<h1>Karriere</h1><a href="/jobs/1">Account Executive</a><a href="/jobs/2">SDR</a>',
  }
  const fetchStub = (async (url: string | URL | Request) =>
    new Response(pages[String(url)] ?? 'nope', { status: pages[String(url)] ? 200 : 404 })) as typeof fetch
  const ctx = {
    domain: 'acme.de', fetch: fetchStub,
    page: async () => ({ status: 200, url: 'https://acme.de/', html: '<a href="/karriere">Karriere</a>', headers: {} }),
  } as unknown as ProviderCtx
  const out = await hiringSignal.run(ctx)
  expect(out.data).toEqual({ hiring: true, job_links: 2, careers_url: 'https://acme.de/karriere' })
})
