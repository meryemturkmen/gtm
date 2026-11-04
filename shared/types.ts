// Row types mirrored from supabase/migrations. Keep in sync by hand; the schema is small.

export type PropertyType = 'text' | 'number' | 'boolean' | 'url' | 'enum' | 'json'
export type PropertySource = 'input' | 'provider' | 'ai'

export type ProviderConfig = {
  /** Waterfall, first non-empty wins. "website_meta.description" = provider + output field. */
  providers: string[]
  auto?: boolean
}

export type AiConfig = {
  prompt: string
  /** JSON schema the model must satisfy; the cell value is the object (or its single field). */
  schema: Record<string, unknown>
  /** Property keys the prompt references; they are enriched first. */
  uses: string[]
  auto?: boolean
}

export type Property = {
  id: string
  workspace_id: string
  key: string
  label: string
  type: PropertyType
  source: PropertySource
  config: ProviderConfig | AiConfig | Record<string, never>
  position: number
}

export type Company = {
  id: string
  workspace_id: string
  domain: string
  name: string | null
  props: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed'

export type Job = {
  id: string
  workspace_id: string
  company_id: string
  property_key: string
  status: JobStatus
  attempts: number
  run_after: string
  last_error: string | null
}

export type Run = {
  id: string
  company_id: string
  property_key: string
  provider: string
  status: 'done' | 'empty' | 'failed'
  input: unknown
  output: unknown
  error: string | null
  tokens: number
  cost_cents: number
  duration_ms: number
  created_at: string
}

export type Workspace = { id: string; name: string; icp: string }
export type Member = { workspace_id: string; user_id: string; role: 'owner' | 'editor' | 'viewer' }
