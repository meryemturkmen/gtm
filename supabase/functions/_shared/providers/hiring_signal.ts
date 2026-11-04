import { fetchPage, type Provider } from './kit.ts'

const CAREER_PATHS = ['/careers', '/jobs', '/karriere', '/career', '/jobs/', '/stellenangebote', '/join-us']
const JOB_WORDS = /\b(job|jobs|position|opening|vacanc|stelle|stellen|karriere|career|hiring|join (?:us|our team))\b/i

/** Links on a page that look like job postings. */
export function countJobLinks(html: string) {
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? []
  return anchors.filter(a => JOB_WORDS.test(a.replace(/<[^>]+>/g, ' ')) || /\/(?:jobs?|careers?|karriere|stellen)\//i.test(a)).length
}

/** First link on the homepage that points at a careers page. */
export function findCareersLink(html: string, base: string) {
  const m = html.match(/href=["']([^"']*(?:career|karriere|jobs|stellen|join-us)[^"']*)["']/i)?.[1]
  if (!m) return null
  try { return new URL(m, base).toString() } catch { return null }
}

export const hiringSignal: Provider = {
  name: 'hiring_signal',
  fields: ['hiring', 'job_links', 'careers_url'],
  cacheHours: 24,
  async run(ctx) {
    const home = await ctx.page()
    const base = home.url || `https://${ctx.domain}/`
    const candidates = [findCareersLink(home.html, base), ...CAREER_PATHS.map(p => new URL(p, base).toString())]
      .filter((u): u is string => !!u)
    for (const url of [...new Set(candidates)]) {
      let page
      try { page = await fetchPage(ctx.fetch, url) } catch { continue }
      if (page.status !== 200 || !JOB_WORDS.test(page.html)) continue
      const job_links = countJobLinks(page.html)
      return { data: { hiring: job_links > 0, job_links, careers_url: page.url } }
    }
    return { data: { hiring: false, job_links: 0, careers_url: null } }
  },
}
