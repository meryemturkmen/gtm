import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useWorkspace } from '../_app'
import { supabase } from '../../lib/supabase'
import { usePlaybookRuns, usePlaybooks, useStages, type Playbook } from '../../lib/crm'
import { useProperties, useRealtime } from '../../lib/queries'
import { Sheet } from '../../components/Sheet'
import { conditionOps, type Action, type Condition } from '../../../supabase/functions/_shared/playbooks.ts'

export const Route = createFileRoute('/_app/playbooks')({ component: PlaybooksPage })

function PlaybooksPage() {
  const ws = useWorkspace().data!
  useRealtime(ws.id)
  const playbooks = usePlaybooks(ws.id)
  const runs = usePlaybookRuns(ws.id)
  const properties = useProperties(ws.id)
  const stages = useStages(ws.id)
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Playbook | 'new' | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['playbooks', ws.id] })

  const toggle = useMutation({
    mutationFn: async (p: Playbook) => { const { error } = await supabase.from('playbooks').update({ enabled: !p.enabled }).eq('id', p.id); if (error) throw error },
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('playbooks').delete().eq('id', id); if (error) throw error },
    onSuccess: refresh,
  })

  const label = (key: string) => properties.data?.find(p => p.key === key)?.label ?? key
  const describe = (p: Playbook) => {
    const op = conditionOps.find(o => o.op === p.condition.op)
    const cond = `${label(p.trigger_key)} ${op?.label ?? p.condition.op}${'value' in p.condition ? ` ${String(p.condition.value)}` : ''}`
    const acts = p.actions.map(a =>
      a.type === 'create_deal' ? `create deal in ${stages.data?.find(s => s.id === a.stage_id)?.name ?? 'stage'}`
      : a.type === 'webhook' ? `POST ${a.url.replace(/^https?:\/\//, '').slice(0, 30)}`
      : a.type === 'enqueue' ? `run ${a.keys.map(label).join(', ')}`
      : `set ${label(a.key)}`).join(', then ')
    return `When ${cond} → ${acts || 'nothing'}`
  }

  return (
    <>
      <header className="flex items-center gap-2 px-4 h-12 border-b border-separator bg-surface">
        <h1 className="font-semibold">Playbooks</h1>
        <span className="text-label-2">fire once per company when a cell changes</span>
        <button className="btn btn-primary ml-auto" onClick={() => setEditing('new')}>New playbook</button>
      </header>
      <div className="p-4 flex flex-col gap-6 max-w-4xl">
        {playbooks.error && <p role="alert" className="text-red">{playbooks.error.message}</p>}
        <ul className="card divide-y divide-separator">
          {playbooks.data?.map(p => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <label className="flex items-center gap-2 shrink-0" title={p.enabled ? 'Enabled' : 'Disabled'}>
                <input type="checkbox" checked={p.enabled} onChange={() => toggle.mutate(p)} aria-label={`Enable ${p.name}`} />
              </label>
              <div className="min-w-0 flex-1">
                <div className={`font-medium ${p.enabled ? '' : 'text-label-2'}`}>{p.name}</div>
                <div className="text-label-2 truncate">{describe(p)}</div>
              </div>
              <button className="btn" onClick={() => setEditing(p)}>Edit</button>
              <button className="btn" onClick={() => { if (confirm(`Delete playbook "${p.name}"?`)) remove.mutate(p.id) }}>Delete</button>
            </li>
          ))}
          {playbooks.data?.length === 0 && <li className="p-6 text-center text-label-2">No playbooks. Create one to turn enrichment into pipeline.</li>}
        </ul>

        <section>
          <h2 className="font-semibold mb-2">Recent runs</h2>
          <ul className="card divide-y divide-separator">
            {runs.data?.map(r => (
              <li key={r.id} className="flex items-center gap-3 px-3 h-9 text-label-2">
                <span className={`size-1.5 rounded-full shrink-0 ${r.error ? 'bg-red' : r.matched ? 'bg-green' : 'bg-label-3'}`} aria-label={r.error ? 'failed' : r.matched ? 'fired' : 'skipped'} />
                <span className="text-label w-44 truncate">{playbooks.data?.find(p => p.id === r.playbook_id)?.name ?? '…'}</span>
                <Link to="/companies/$id" params={{ id: r.company_id }} className="w-44 truncate hover:underline">{r.companies?.domain}</Link>
                <span className="flex-1 truncate">{r.error ?? (r.matched ? r.result.map(x => (x as { type: string }).type).join(', ') : 'condition not met')}</span>
                <time className="tabular-nums">{new Date(r.created_at).toLocaleString()}</time>
              </li>
            ))}
            {runs.data?.length === 0 && <li className="p-4 text-center text-label-2">Nothing has fired yet.</li>}
          </ul>
        </section>
      </div>
      {editing && (
        <PlaybookSheet workspaceId={ws.id} playbook={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)} onSaved={() => { refresh(); setEditing(null) }} />
      )}
    </>
  )
}

function PlaybookSheet({ workspaceId, playbook, onClose, onSaved }: { workspaceId: string; playbook: Playbook | null; onClose: () => void; onSaved: () => void }) {
  const properties = useProperties(workspaceId)
  const stages = useStages(workspaceId)
  const [name, setName] = useState(playbook?.name ?? '')
  const [trigger, setTrigger] = useState(playbook?.trigger_key ?? 'icp_score')
  const [op, setOp] = useState<Condition['op']>(playbook?.condition.op ?? 'gte')
  const [value, setValue] = useState(playbook && 'value' in playbook.condition ? String(playbook.condition.value) : '70')
  const [actions, setActions] = useState<Action[]>(playbook?.actions ?? [])
  const [error, setError] = useState('')
  const needsValue = conditionOps.find(o => o.op === op)?.needsValue

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const parsed = value === 'true' ? true : value === 'false' ? false : value !== '' && !isNaN(Number(value)) ? Number(value) : value
    const condition = needsValue ? { op, value: parsed } : { op }
    const row = { workspace_id: workspaceId, name, trigger_key: trigger, condition, actions }
    const { error } = playbook
      ? await supabase.from('playbooks').update(row).eq('id', playbook.id)
      : await supabase.from('playbooks').insert(row)
    if (error) setError(error.message); else onSaved()
  }
  const setAction = (i: number, a: Action) => setActions(as => as.map((x, j) => j === i ? a : x))

  return (
    <Sheet title={playbook ? 'Edit playbook' : 'New playbook'} onClose={onClose}>
      <form onSubmit={save} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1"><span className="text-label-2">Name</span>
          <input className="input" required value={name} onChange={e => setName(e.target.value)} placeholder="Qualify high ICP fits" /></label>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label-2 mb-1">When</legend>
          <select className="input" value={trigger} onChange={e => setTrigger(e.target.value)} aria-label="Trigger column">
            {properties.data?.filter(p => p.source !== 'input').map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <div className="flex gap-2">
            <select className="input" value={op} onChange={e => setOp(e.target.value as Condition['op'])} aria-label="Condition">
              {conditionOps.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
            </select>
            {needsValue && <input className="input" value={value} onChange={e => setValue(e.target.value)} aria-label="Value" />}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label-2 mb-1">Then</legend>
          {actions.map((a, i) => (
            <div key={i} className="flex gap-2 items-start">
              <select className="input w-36 shrink-0" value={a.type} aria-label="Action type"
                onChange={e => setAction(i, defaultAction(e.target.value as Action['type'], stages.data?.[1]?.id ?? ''))}>
                <option value="create_deal">Create deal</option>
                <option value="enqueue">Run columns</option>
                <option value="webhook">Call webhook</option>
                <option value="set_property">Set column</option>
              </select>
              {a.type === 'create_deal' && <>
                <select className="input" value={a.stage_id} onChange={e => setAction(i, { ...a, stage_id: e.target.value })} aria-label="Stage">
                  {stages.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input className="input" value={a.title} onChange={e => setAction(i, { ...a, title: e.target.value })} aria-label="Deal title" placeholder="{{name}}" />
              </>}
              {a.type === 'enqueue' && <input className="input font-mono" value={a.keys.join(', ')} aria-label="Column keys"
                onChange={e => setAction(i, { ...a, keys: e.target.value.split(/[\s,]+/).filter(Boolean) })} placeholder="first_line" />}
              {a.type === 'webhook' && <input className="input" type="url" required value={a.url} aria-label="Webhook URL"
                onChange={e => setAction(i, { ...a, url: e.target.value })} placeholder="https://hooks.example.com/…" />}
              {a.type === 'set_property' && <>
                <input className="input font-mono w-28" value={a.key} onChange={e => setAction(i, { ...a, key: e.target.value })} aria-label="Column key" placeholder="owner_notes" />
                <input className="input" value={String(a.value ?? '')} onChange={e => setAction(i, { ...a, value: e.target.value })} aria-label="Value" />
              </>}
              <button type="button" className="btn shrink-0" aria-label="Remove action" onClick={() => setActions(as => as.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button type="button" className="btn self-start" onClick={() => setActions(as => [...as, defaultAction('create_deal', stages.data?.[1]?.id ?? '')])}>Add action</button>
        </fieldset>
        <p className="text-label-2 text-xs">Webhooks are signed with <code className="font-mono">x-gmt-signature</code> (HMAC-SHA256 of the body with your WEBHOOK_SECRET).</p>
        {error && <p role="alert" className="text-red">{error}</p>}
        <button className="btn btn-primary self-start">{playbook ? 'Save' : 'Create'}</button>
      </form>
    </Sheet>
  )
}

function defaultAction(type: Action['type'], stageId: string): Action {
  switch (type) {
    case 'create_deal': return { type, stage_id: stageId, title: '{{name}}' }
    case 'enqueue': return { type, keys: ['first_line'] }
    case 'webhook': return { type, url: '' }
    case 'set_property': return { type, key: 'owner_notes', value: '' }
  }
}
