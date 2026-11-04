import type { Provider } from './kit.ts'

/** No request needed: Google's favicon service resolves any domain to an icon. */
export const logo: Provider = {
  name: 'logo',
  fields: ['url'],
  cacheHours: 24 * 30,
  async run(ctx) {
    return { data: { url: `https://www.google.com/s2/favicons?domain=${ctx.domain}&sz=128` } }
  },
}
