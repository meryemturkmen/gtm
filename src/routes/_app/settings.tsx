import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useWorkspace } from '../_app'
import { supabase } from '../../lib/supabase'
import { useProperties } from '../../lib/queries'
import { ApiKeys } from '../../components/ApiKeys'
import { PageHeader } from '../../components/PageHeader'
import { providerCatalog } from '../../../supabase/functions/_shared/providers/index.ts'
import { aiSchemas } from '../../../supabase/functions/_shared/waterfall.ts'
import type { Property, PropertyType } from '../../../supabase/functions/_shared/types.ts'

export const Route = createFileRoute('/_app/settings')({ component: SettingsPage })

function SettingsPage() {
  const ws = useWorkspace().data!
  return (
    <>
    <PageHeader title="Settings" />
    <div className="px-6 pb-8 max-w-3xl flex flex-col gap-8">
      <IcpSection workspaceId={ws.id} icp={ws.icp} />
      <ColumnsSection workspaceId={ws.id} />
      <ApiKeys workspaceId={ws.id} />
    </div>
    </>
  )
}

function IcpSection({ workspaceId, icp }: { workspaceId: string; icp: string }) {
  const [text, setText] = useState(icp)
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('workspaces').update({ icp: text }).eq('id', workspaceId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace'] }),
  })
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">Ideal customer profile</h2>
      <p className="text-label-2">AI columns can reference this as <code className="font-mono">{'{{icp}}'}</code>.</p>
      <textarea className="input h-28 py-1.5 resize-y" value={text} onChange={e => setText(e.target.value)}
        placeholder="B2B companies in DACH with 20–500 employees that sell online and hire sales people." />
      <div className="flex items-center gap-2">
        <button className="btn btn-primary" disabled={save.isPending || text === icp} onClick={() => save.mutate()}>Save</button>
        {save.error && <span role="alert" className="text-red">{save.error.message}</span>}
      </div>
    </section>
  )
}

function ColumnsSection({ workspaceId }: { workspaceId: string }) {
  const properties = useProperties(workspaceId)
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['properties', workspaceId] })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('properties').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: refresh,
  })
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Columns</h2>
      <ul className="card divide-y divide-separator">
        {properties.data?.map(p => (
          <li key={p.id} className="flex items-center gap-3 px-3 h-9">
            <span className="w-40 truncate">{p.label}</span>
            <code className="font-mono text-label-2 w-32 truncate">{p.key}</code>
            <span className="text-label-2 w-16">{p.type}</span>
            <span className="text-label-2 truncate flex-1 font-mono text-xs">{describe(p)}</span>
            <button className="btn" onClick={() => { if (confirm(`Delete column "${p.label}"? Values stay in the data but are hidden.`)) remove.mutate(p.id) }}>Delete</button>
          </li>
        ))}
      </ul>
      <NewColumnForm workspaceId={workspaceId} position={(properties.data?.length ?? 0) + 1} onCreated={refresh} />
    </section>
  )
}

const describe = (p: Property) =>
  p.source === 'input' ? 'typed by hand'
    : p.source === 'ai' ? `AI · ${(p.config as { prompt?: string }).prompt?.slice(0, 60) ?? ''}`
    : (p.config as { providers?: string[] }).providers?.join(' → ') ?? ''

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]/, 'c$&').slice(0, 40)

function NewColumnForm({ workspaceId, position, onCreated }: { workspaceId: string; position: number; onCreated: () => void }) {
  const [label, setLabel] = useState('')
  const [source, setSource] = useState<'input' | 'provider' | 'ai'>('provider')
  const [type, setType] = useState<PropertyType>('text')
  const [spec, setSpec] = useState('website_meta.description')
  const [prompt, setPrompt] = useState('')
  const [shape, setShape] = useState<keyof typeof aiSchemas>('text')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const key = slug(label)
    const uses = [...prompt.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map(m => m[1]!).filter(k => k !== 'domain' && k !== 'icp')
    const config = source === 'provider' ? { providers: spec.split(/[,\s]+/).filter(Boolean) }
      : source === 'ai' ? { prompt, schema: aiSchemas[shape], uses, auto: false }
      : {}
    const aiType: PropertyType = shape === 'text' ? 'text' : shape === 'boolean' ? 'json' : 'json'
    const { error } = await supabase.from('properties').insert({
      workspace_id: workspaceId, key, label, source, type: source === 'ai' ? aiType : type, config, position,
    })
    if (error) { setError(error.message); return }
    setError(''); setLabel(''); setPrompt(''); onCreated()
  }

  return (
    <form onSubmit={submit} className="card p-4 grid grid-cols-[8rem_1fr] gap-x-4 gap-y-3 items-center">
      <h3 className="col-span-2 font-semibold">New column</h3>
      <label htmlFor="col-label" className="text-label-2">Label</label>
      <input id="col-label" className="input" required value={label} onChange={e => setLabel(e.target.value)} placeholder="ICP score" />
      <span className="text-label-2">Key</span>
      <code className="font-mono text-label-2">{slug(label) || '…'}</code>

      <label htmlFor="col-source" className="text-label-2">Filled by</label>
      <select id="col-source" className="input" value={source} onChange={e => setSource(e.target.value as typeof source)}>
        <option value="provider">Enrichment provider</option>
        <option value="ai">AI prompt</option>
        <option value="input">Typed by hand</option>
      </select>

      {source === 'provider' && <>
        <label htmlFor="col-spec" className="text-label-2">Waterfall</label>
        <div>
          <input id="col-spec" className="input font-mono" value={spec} onChange={e => setSpec(e.target.value)} />
          <p className="text-label-2 mt-1 text-xs">Comma-separated, first non-empty wins. Available:{' '}
            {providerCatalog.map(p => p.fields.map(f => `${p.name}.${f}`).join(', ')).join(', ')}</p>
        </div>
      </>}

      {source === 'ai' && <>
        <label htmlFor="col-prompt" className="text-label-2">Prompt</label>
        <div>
          <textarea id="col-prompt" className="input h-24 py-1.5 resize-y" required value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder="Rate how well {{name}} ({{description}}) fits this ICP: {{icp}}" />
          <p className="text-label-2 mt-1 text-xs">Use {'{{key}}'} for any column, plus {'{{domain}}'} and {'{{icp}}'}. Referenced columns are enriched first. AI columns run only when you ask (cost).</p>
        </div>
        <label htmlFor="col-shape" className="text-label-2">Answer shape</label>
        <select id="col-shape" className="input" value={shape} onChange={e => setShape(e.target.value as typeof shape)}>
          <option value="text">Text</option>
          <option value="score">Score 0–100 with reason</option>
          <option value="boolean">Yes/no with reason</option>
        </select>
      </>}

      {source !== 'ai' && <>
        <label htmlFor="col-type" className="text-label-2">Type</label>
        <select id="col-type" className="input" value={type} onChange={e => setType(e.target.value as PropertyType)}>
          {(['text', 'number', 'boolean', 'url', 'json'] as const).map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </>}

      {error && <p role="alert" className="col-span-2 text-red">{error}</p>}
      <div className="col-span-2"><button className="btn btn-primary">Add column</button></div>
    </form>
  )
}
