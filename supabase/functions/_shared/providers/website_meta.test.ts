import { describe, expect, it } from 'vitest'
import { parseWebsiteMeta } from './website_meta.ts'

const html = `<!doctype html><html lang="de-DE"><head>
<title>Acme GmbH | Industriepumpen aus Bremen</title>
<meta name="description" content="Acme baut Pumpen &amp; Ventile f&uuml;r die Industrie.">
<meta property="og:image" content="https://acme.de/og.png">
</head><body>
<a href="https://www.linkedin.com/company/acme-gmbh/">LinkedIn</a>
<a href="https://instagram.com/acme.de">IG</a>
<a href="mailto:Info@Acme.de">Mail</a> <img src="logo@2x.png">
<a href="mailto:info@acme.de">again</a>
</body></html>`

describe('parseWebsiteMeta', () => {
  const out = parseWebsiteMeta(html, 'acme.de')

  it('takes the name from the title before the separator', () => {
    expect(out.name).toBe('Acme GmbH')
  })
  it('decodes entities in the description', () => {
    expect(out.description).toBe('Acme baut Pumpen & Ventile f&uuml;r die Industrie.')
  })
  it('finds language, image and social links', () => {
    expect(out.language).toBe('de-de')
    expect(out.og_image).toBe('https://acme.de/og.png')
    expect(out.linkedin).toBe('https://www.linkedin.com/company/acme-gmbh/')
    expect(out.instagram).toBe('https://instagram.com/acme.de')
    expect(out.twitter).toBeNull()
  })
  it('dedupes emails case-insensitively and skips image names', () => {
    expect(out.emails).toEqual(['info@acme.de'])
  })
  it('falls back to the domain when there is no title', () => {
    expect(parseWebsiteMeta('<html></html>', 'x.io').name).toBe('x.io')
  })
})
