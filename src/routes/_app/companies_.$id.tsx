import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useWorkspace } from '../_app'
import { supabase } from '../../lib/supabase'
import { useActivities, useCompany, useCompanyDeals, useContacts, useStages } from '../../lib/crm'
import { enqueue, useOpenJobs, useProperties, useRealtime } from '../../lib/queries'
import { Cell } from '../../components/Cell'
import { RunSheet } from '../../components/RunSheet'
import type { Property } from '../../../supabase/functions/_shared/types.ts'

export const Route = createFileRoute('/_app/companies_/$id')({ component: CompanyPage })

function CompanyPage() {
  const { id } = Route.useParams()
  const ws = useWorkspace().data!
  useRealtime(ws.id)
  const company = useCompany(id)
  const properties = useProperties(ws.id)
  const jobs = useOpenJobs(ws.id)
  const [open, setOpen] = useState<Property | null>(null)
  const qc = useQueryClient()

  if (company.isPending) return <p className="p-6 text-label-2">Loading…</p>
  if (company.error || !company.data) return <p role="alert" className="p-6 text-red">{company.error?.message ?? 'Not found'}</p>
  const c = company.data
  const name = (c.props.name as string) || c.domain
  const logo = c.props.logo as string | undefined
  const enrichable = (properties.data ?? []).filter(p => p.source !== 'input').map(p => p.key)

  return (
    <>
      <header className="flex items-center gap-3 px-4 h-12 border-b border-separator bg-surface">
        <Link to="/companies" className="text-label-2 hover:text-label">Companies</Link>
        <span className="text-label-3">/</span>
        {logo && <img src={logo} alt="" className="size-5 rounded-sm" />}
        <h1 className="font-semibold truncate">{name}</h1>
        <a href={`https://${c.domain}`} target="_blank" rel="noreferrer" className="text-label-2 hover:underline">{c.domain}</a>
        <button className="btn ml-auto" onClick={async () => { await enqueue([c.id], enrichable); qc.invalidateQueries({ queryKey: ['jobs', ws.id] }) }}>
          Re-run all columns
        </button>
      </header>
      <div className="flex-1 overflow-auto p-4 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
        <div className="flex flex-col gap-4">
          <section className="card">
            <h2 className="font-semibold px-3 h-9 flex items-center border-b border-separator">Properties</h2>
            <dl className="divide-y divide-separator">
              {properties.data?.map(p => (
                <div key={p.id} className="grid grid-cols-[10rem_1fr] items-center min-h-9">
                  <dt className="px-3 text-label-2">{p.label}</dt>
                  <dd className="min-h-9 flex items-center border-l border-separator/60">
                    <Cell company={c} property={p} meta={c.meta[p.key]} job={jobs.data?.[`${c.id}:${p.key}`]} onOpen={() => setOpen(p)} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <Contacts companyId={c.id} workspaceId={ws.id} />
        </div>
        <div className="flex flex-col gap-4">
          <Deals companyId={c.id} workspaceId={ws.id} title={name} />
          <Timeline companyId={c.id} workspaceId={ws.id} />
        </div>
      </div>
      {open && <RunSheet company={c} property={open} job={jobs.data?.[`${c.id}:${open.key}`]} onClose={() => setOpen(null)} />}
    </>
  )
}

function Deals({ companyId, workspaceId, title }: { companyId: string; workspaceId: string; title: string }) {
  const deals = useCompanyDeals(companyId)
  const stages = useStages(workspaceId)
  const qc = useQueryClient()
  const refresh = () => { qc.invalidateQueries({ queryKey: ['deals'] }); qc.invalidateQueries({ queryKey: ['activities', companyId] }) }
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('deals').insert({ workspace_id: workspaceId, company_id: companyId, stage_id: stages.data![0]!.id, title })
      if (error) throw error
    },
    onSuccess: refresh,
  })
  const move = useMutation({
    mutationFn: async ({ id, stage_id }: { id: string; stage_id: string }) => {
      const { error } = await supabase.from('deals').update({ stage_id }).eq('id', id); if (error) throw error
    },
    onSuccess: refresh,
  })
  const setAmount = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number | null }) => {
      const { error } = await supabase.from('deals').update({ amount }).eq('id', id); if (error) throw error
    },
    onSuccess: refresh,
  })
  return (
    <section className="card">
      <h2 className="font-semibold px-3 h-9 flex items-center justify-between border-b border-separator">Deals
        <button className="btn" disabled={!stages.data?.length || create.isPending} onClick={() => create.mutate()}>Add deal</button>
      </h2>
      <ul className="divide-y divide-separator">
        {deals.data?.map(d => (
          <li key={d.id} className="px-3 py-2 flex flex-col gap-1.5">
            <Link to="/deals" className="font-medium hover:underline">{d.title}</Link>
            <div className="flex gap-2">
              <select className="input" value={d.stage_id} aria-label="Stage" onChange={e => move.mutate({ id: d.id, stage_id: e.target.value })}>
                {stages.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <input className="input w-28 tabular-nums" type="number" min="0" step="100" placeholder="€ amount" aria-label="Amount"
                defaultValue={d.amount ?? ''} onBlur={e => setAmount.mutate({ id: d.id, amount: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
          </li>
        ))}
        {deals.data?.length === 0 && <li className="px-3 py-3 text-label-2">No deals.</li>}
      </ul>
    </section>
  )
}

function Contacts({ companyId, workspaceId }: { companyId: string; workspaceId: string }) {
  const contacts = useContacts(companyId)
  const qc = useQueryClient()
  const [draft, setDraft] = useState({ first_name: '', last_name: '', email: '', title: '' })
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('contacts').insert({ workspace_id: workspaceId, company_id: companyId, ...draft, email: draft.email || null, title: draft.title || null })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts', companyId] }); setDraft({ first_name: '', last_name: '', email: '', title: '' }) },
  })
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('contacts').delete().eq('id', id); if (error) throw error },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts', companyId] }),
  })
  return (
    <section className="card">
      <h2 className="font-semibold px-3 h-9 flex items-center border-b border-separator">Contacts</h2>
      <ul className="divide-y divide-separator">
        {contacts.data?.map(ct => (
          <li key={ct.id} className="px-3 h-9 flex items-center gap-3">
            <span className="font-medium w-44 truncate">{ct.first_name} {ct.last_name}</span>
            <span className="text-label-2 w-40 truncate">{ct.title}</span>
            {ct.email && <a href={`mailto:${ct.email}`} className="text-accent hover:underline truncate">{ct.email}</a>}
            <button className="btn ml-auto" onClick={() => remove.mutate(ct.id)} aria-label={`Remove ${ct.first_name}`}>Remove</button>
          </li>
        ))}
      </ul>
      <form className="px-3 py-2 flex gap-2 border-t border-separator" onSubmit={e => { e.preventDefault(); add.mutate() }}>
        <input className="input" required placeholder="First name" aria-label="First name" value={draft.first_name} onChange={e => setDraft({ ...draft, first_name: e.target.value })} />
        <input className="input" placeholder="Last name" aria-label="Last name" value={draft.last_name} onChange={e => setDraft({ ...draft, last_name: e.target.value })} />
        <input className="input" placeholder="Title" aria-label="Title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
        <input className="input" type="email" placeholder="Email" aria-label="Email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} />
        <button className="btn shrink-0" disabled={add.isPending}>Add</button>
      </form>
      {add.error && <p role="alert" className="px-3 pb-2 text-red">{add.error.message}</p>}
    </section>
  )
}

function Timeline({ companyId, workspaceId }: { companyId: string; workspaceId: string }) {
  const activities = useActivities(companyId)
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const add = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('activities').insert({ workspace_id: workspaceId, company_id: companyId, kind: 'note', body: note, actor_id: user?.id })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activities', companyId] }); setNote('') },
  })
  return (
    <section className="card">
      <h2 className="font-semibold px-3 h-9 flex items-center border-b border-separator">Timeline</h2>
      <form className="p-3 flex gap-2 border-b border-separator" onSubmit={e => { e.preventDefault(); add.mutate() }}>
        <input className="input" placeholder="Add a note…" aria-label="Note" value={note} onChange={e => setNote(e.target.value)} />
        <button className="btn shrink-0" disabled={!note.trim() || add.isPending}>Post</button>
      </form>
      <ol className="divide-y divide-separator max-h-[60vh] overflow-y-auto">
        {activities.data?.map(a => (
          <li key={a.id} className="px-3 py-2 flex gap-3">
            <span className={`mt-1.5 size-1.5 rounded-full shrink-0 ${a.kind === 'note' ? 'bg-accent' : 'bg-label-3'}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className={a.kind === 'system' ? 'text-label-2' : ''}>{a.body}</p>
              <time className="text-label-3 text-xs tabular-nums">{new Date(a.created_at).toLocaleString()}</time>
            </div>
          </li>
        ))}
        {activities.data?.length === 0 && <li className="px-3 py-3 text-label-2">Nothing yet. Enrichment, playbooks and deals write here.</li>}
      </ol>
    </section>
  )
}

