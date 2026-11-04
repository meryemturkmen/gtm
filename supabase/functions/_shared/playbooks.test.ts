import { expect, it } from 'vitest'
import { matches, scalar, sign } from './playbooks.ts'

it('looks through AI answer shapes', () => {
  expect(scalar({ score: 81, reason: 'x' })).toBe(81)
  expect(scalar({ answer: false, reason: 'x' })).toBe(false)
  expect(scalar(['a'])).toEqual(['a'])
})

it('evaluates numeric, equality and containment conditions', () => {
  expect(matches({ op: 'gte', value: 70 }, { score: 81 })).toBe(true)
  expect(matches({ op: 'gte', value: 70 }, { score: 69 })).toBe(false)
  expect(matches({ op: 'eq', value: true }, true)).toBe(true)
  expect(matches({ op: 'eq', value: 'Google Workspace' }, 'Google Workspace')).toBe(true)
  expect(matches({ op: 'contains', value: 'shopify' }, ['Shopify', 'HubSpot'])).toBe(true)
  expect(matches({ op: 'not_contains', value: 'wix' }, ['Shopify'])).toBe(true)
  expect(matches({ op: 'any' }, null)).toBe(false)
  expect(matches({ op: 'any' }, 'x')).toBe(true)
  expect(matches({ op: 'empty' }, [])).toBe(true)
})

it('signs payloads with HMAC-SHA256', async () => {
  expect(await sign('secret', 'hello')).toBe('88aab3ede8d3adf94d26ab90d3bafd4a2083070c3bcce9c014ee04a443847c0b')
})
