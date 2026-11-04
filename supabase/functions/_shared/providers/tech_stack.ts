import type { Provider } from './kit.ts'

// Signature → technology. Tested against HTML plus a "header: value" dump of the response headers.
export const signatures: [string, RegExp][] = [
  ['Shopify', /cdn\.shopify\.com|x-shopid|Shopify\.theme/i],
  ['WooCommerce', /woocommerce/i],
  ['WordPress', /wp-content\/|wp-includes\//i],
  ['Webflow', /webflow\.(?:com|io)|data-wf-site/i],
  ['Wix', /static\.wixstatic\.com|x-wix-/i],
  ['Squarespace', /squarespace\.com|static1\.squarespace/i],
  ['HubSpot', /js\.hs-scripts\.com|hs-analytics|hubspot/i],
  ['Salesforce', /salesforce\.com|pardot\.com/i],
  ['Intercom', /widget\.intercom\.io|intercomcdn/i],
  ['Zendesk', /zdassets\.com|zendesk\.com/i],
  ['Google Analytics', /googletagmanager\.com\/gtag|google-analytics\.com|gtag\(/i],
  ['Google Tag Manager', /googletagmanager\.com\/gtm\.js/i],
  ['Meta Pixel', /connect\.facebook\.net\/[a-z_]+\/fbevents/i],
  ['LinkedIn Insight', /snap\.licdn\.com/i],
  ['Hotjar', /static\.hotjar\.com/i],
  ['Segment', /cdn\.segment\.com/i],
  ['Klaviyo', /static\.klaviyo\.com/i],
  ['Mailchimp', /list-manage\.com|chimpstatic\.com/i],
  ['Stripe', /js\.stripe\.com/i],
  ['PayPal', /paypal\.com\/sdk/i],
  ['Cloudflare', /cf-ray:|__cfduid|cdn-cgi\//i],
  ['Vercel', /x-vercel-id:|server: vercel/i],
  ['Netlify', /server: netlify/i],
  ['Next.js', /_next\/static|x-powered-by: next\.js/i],
  ['Nuxt', /_nuxt\//i],
  ['React', /react-dom|data-reactroot|__NEXT_DATA__/i],
  ['Vue', /vue\.(?:runtime\.)?(?:min\.)?js|data-v-[a-f0-9]{8}/i],
  ['Angular', /ng-version=/i],
  ['TYPO3', /typo3conf|typo3temp/i],
  ['Drupal', /drupal\.js|x-generator: drupal/i],
  ['Shopware', /shopware/i],
  ['Magento', /mage\/|magento/i],
  ['Cookiebot', /consent\.cookiebot\.com/i],
  ['Usercentrics', /app\.usercentrics\.eu/i],
  ['Calendly', /assets\.calendly\.com/i],
  ['Typeform', /embed\.typeform\.com/i],
  ['reCAPTCHA', /google\.com\/recaptcha/i],
  ['Font Awesome', /font-awesome|fontawesome/i],
  ['Google Fonts', /fonts\.googleapis\.com/i],
  ['jQuery', /jquery[.-]/i],
]

export function detectStack(html: string, headers: Record<string, string> = {}) {
  const headerDump = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\n')
  const haystack = `${headerDump}\n${html}`
  return signatures.filter(([, re]) => re.test(haystack)).map(([name]) => name)
}

export const techStack: Provider = {
  name: 'tech_stack',
  fields: ['stack', 'count'],
  cacheHours: 24 * 7,
  async run(ctx) {
    const page = await ctx.page()
    const stack = detectStack(page.html, page.headers)
    return { data: { stack, count: stack.length } }
  },
}
