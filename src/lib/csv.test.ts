import { expect, it } from 'vitest'
import { domainsFromCsv, parseCsv, toCsv } from './csv'

it('parses quoted fields, escaped quotes and CRLF', () => {
  expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([['a', 'b, c', 'say "hi"'], ['1', '2', '3']])
})

it('finds the domain column by header', () => {
  expect(domainsFromCsv('Name,Website\nAcme,https://acme.de\nBeta,beta.com')).toEqual(['https://acme.de', 'beta.com'])
})

it('finds the domain column by content when there is no header', () => {
  expect(domainsFromCsv('Acme;acme.de;Berlin\nBeta;beta.com;Munich')).toEqual(['acme.de', 'beta.com'])
  expect(domainsFromCsv('just,words\nno,domains')).toEqual([])
})

it('writes CSV that round-trips', () => {
  const csv = toCsv(['domain', 'stack'], [['acme.de', ['Shopify', 'HubSpot']], ['x.io', 'a "quoted" thing']])
  expect(parseCsv(csv)).toEqual([['domain', 'stack'], ['acme.de', '["Shopify","HubSpot"]'], ['x.io', 'a "quoted" thing']])
})
