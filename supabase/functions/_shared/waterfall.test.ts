import { expect, it } from 'vitest'
import { aiSchemas, isEmpty, parseSpec, pick, unwrapAi } from './waterfall.ts'

it('parses provider specs', () => {
  expect(parseSpec('website_meta.description')).toEqual({ provider: 'website_meta', field: 'description' })
  expect(parseSpec('logo')).toEqual({ provider: 'logo', field: null })
})

it('treats null, empty string and empty array as empty', () => {
  expect([null, undefined, '', []].every(isEmpty)).toBe(true)
  expect([0, false, 'x', [1]].some(isEmpty)).toBe(false)
})

it('picks a field or the whole output', () => {
  expect(pick({ a: 1 }, 'a')).toBe(1)
  expect(pick({ a: 1 }, null)).toEqual({ a: 1 })
})

it('unwraps single-field AI schemas and strips private fields', () => {
  expect(unwrapAi({ text: 'hi', _prompt: 'p' }, aiSchemas.text)).toBe('hi')
  expect(unwrapAi({ score: 81, reason: 'r', _prompt: 'p' }, aiSchemas.score)).toEqual({ score: 81, reason: 'r' })
})
