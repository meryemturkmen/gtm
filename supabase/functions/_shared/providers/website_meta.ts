import type { Provider } from './kit.ts'

const meta = (html: string, attr: 'name' | 'property', key: string) => {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*>`, 'i')
  const tag = html.match(re)?.[0]
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '') : ''
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()

const social = (html: string, host: string) =>
  html.match(new RegExp(`https?://(?:www\\.)?${host}/[A-Za-z0-9_./-]+`, 'i'))?.[0] ?? null

/** Pulls the facts a human would read off a homepage. No DOM parser: regex on capped HTML is enough here. */
export function parseWebsiteMeta(html: string, domain: string) {
  const title = decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '')
  const siteName = meta(html, 'property', 'og:site_name')
  // "Acme | Industrial pumps" → "Acme"
  const name = siteName || title.split(/\s[|–—-]\s/)[0]?.trim() || domain
  const description = meta(html, 'name', 'description') || meta(html, 'property', 'og:description')
  const language = html.match(/<html[^>]+lang=["']([a-zA-Z-]+)["']/i)?.[1]?.toLowerCase() ?? null
  const emails = [...new Set(
    (html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])
      .map(e => e.toLowerCase())
      .filter(e => !/\.(png|jpg|jpeg|gif|svg|webp)$/.test(e) && !e.includes('example.')),
  )].slice(0, 10)
  return {
    name,
    title,
    description: description || null,
    language,
    og_image: meta(html, 'property', 'og:image') || null,
    linkedin: social(html, 'linkedin\\.com/(?:company|school)'),
    twitter: social(html, '(?:twitter|x)\\.com'),
    instagram: social(html, 'instagram\\.com'),
    facebook: social(html, 'facebook\\.com'),
    emails,
  }
}

export const websiteMeta: Provider = {
  name: 'website_meta',
  fields: ['name', 'title', 'description', 'language', 'og_image', 'linkedin', 'twitter', 'instagram', 'facebook', 'emails'],
  cacheHours: 24,
  async run(ctx) {
    const page = await ctx.page()
    if (page.status >= 400) throw new Error(`homepage returned HTTP ${page.status}`)
    return { data: { ...parseWebsiteMeta(page.html, ctx.domain), final_url: page.url } }
  },
}
