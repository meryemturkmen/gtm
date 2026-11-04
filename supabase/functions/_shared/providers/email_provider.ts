import type { Provider } from './kit.ts'

const DOH = 'https://cloudflare-dns.com/dns-query'

const known: [string, RegExp][] = [
  ['Google Workspace', /\.google(?:mail)?\.com\.?$/i],
  ['Microsoft 365', /\.outlook\.com\.?$|\.office365\.com\.?$/i],
  ['Proofpoint', /pphosted\.com\.?$/i],
  ['Mimecast', /mimecast\.com\.?$/i],
  ['Zoho', /zoho\.(?:com|eu)\.?$/i],
  ['IONOS', /ionos\.(?:de|com)\.?$|kundenserver\.de\.?$/i],
  ['Strato', /strato\.de\.?$|rzone\.de\.?$/i],
  ['Hetzner', /your-server\.de\.?$/i],
  ['All-Inkl', /kasserver\.com\.?$/i],
  ['Hostinger', /hostinger\.com\.?$/i],
  ['Cloudflare Email', /mx\.cloudflare\.net\.?$/i],
]

export function classifyMx(hosts: string[]) {
  if (hosts.length === 0) return null
  for (const [name, re] of known) if (hosts.some(h => re.test(h))) return name
  return 'Self-hosted / other'
}

/** "10 aspmx.l.google.com." → "aspmx.l.google.com" */
export const mxHost = (answer: string) => answer.split(/\s+/).pop()?.replace(/\.$/, '') ?? ''

export const emailProvider: Provider = {
  name: 'email_provider',
  fields: ['provider', 'mx', 'has_mx'],
  cacheHours: 24 * 7,
  async run(ctx) {
    const res = await ctx.fetch(`${DOH}?name=${encodeURIComponent(ctx.domain)}&type=MX`, {
      headers: { accept: 'application/dns-json' },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`DNS lookup failed: HTTP ${res.status}`)
    const json = await res.json() as { Answer?: { type: number; data: string }[] }
    const mx = (json.Answer ?? []).filter(a => a.type === 15).map(a => mxHost(a.data))
    return { data: { provider: classifyMx(mx), mx, has_mx: mx.length > 0 } }
  },
}
