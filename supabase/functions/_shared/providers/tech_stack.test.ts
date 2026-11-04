import { expect, it } from 'vitest'
import { detectStack } from './tech_stack.ts'

it('detects technologies from markup and headers', () => {
  const html = `<script src="https://cdn.shopify.com/s/x.js"></script>
    <script src="https://js.hs-scripts.com/123.js"></script>
    <script>gtag('config','G-1');</script>`
  const stack = detectStack(html, { 'cf-ray': 'abc', server: 'cloudflare' })
  expect(stack).toEqual(['Shopify', 'HubSpot', 'Google Analytics', 'Cloudflare'])
})

it('returns an empty list for plain pages', () => {
  expect(detectStack('<html><body>hi</body></html>')).toEqual([])
})
