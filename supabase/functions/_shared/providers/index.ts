// Provider registry. A provider turns a company (domain + known props) into a JSON object;
// columns pick one field of it (see waterfall.ts).

import type { Provider } from './kit.ts'
export * from './kit.ts'

import { websiteMeta } from './website_meta.ts'
import { techStack } from './tech_stack.ts'
import { emailProvider } from './email_provider.ts'
import { hiringSignal } from './hiring_signal.ts'
import { logo } from './logo.ts'
import { ai } from './ai.ts'

export const providers: Record<string, Provider> = Object.fromEntries(
  [websiteMeta, techStack, emailProvider, hiringSignal, logo, ai].map(p => [p.name, p]),
)

export const providerCatalog = Object.values(providers)
  .filter(p => p.name !== 'ai')
  .map(p => ({ name: p.name, fields: p.fields }))
