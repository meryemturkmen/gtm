import { createFileRoute, Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useWorkspace } from '../_app'
import { supabase } from '../../lib/supabase'
import { PAGE_SIZE, enqueue, useCompanies, useOpenJobs, useProperties, useRealtime } from '../../lib/queries'
import { useStages } from '../../lib/crm'
import { defaultView, useSavedViews, type View } from '../../lib/views'
import { Cell } from '../../components/Cell'
import { RunSheet } from '../../components/RunSheet'
import { AddCompaniesSheet } from '../../components/AddCompaniesSheet'
import { PageHeader } from '../../components/PageHeader'
import { Logo } from '../../components/Logo'
import { toCsv } from '../../lib/csv'
import type { Company, Property } from '../../../supabase/functions/_shared/types.ts'

export const Route = createFileRoute('/_app/companies')({ component: CompaniesPage })

function CompaniesPage() {
  const ws = useWorkspace().data!
  return <CompaniesTable workspaceId={ws.id} />
}

function CompaniesTable({ workspaceId }: { workspaceId: string }) {
  useRealtime(workspaceId)
  const [view, setView] = useState<View>(defaultView)
  const [viewId, setViewId] = useState('')
  const [page, setPage] = useState(0)
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<{ company: Company; property: Property } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const properties = useProperties(workspaceId)
  // The logo lives in the Domain cell instead of its own column, and the fit score sits next to the domain:
  // it is the one number people scan the table for.
  const columns = (properties.data ?? []).filter(p => p.key !== 'logo')
    .sort((a, b) => Number(b.key === 'icp_score') - Number(a.key === 'icp_score'))
  const companies = useCompanies(workspaceId, view, page)
  const jobs = useOpenJobs(workspaceId)
  const views = useSavedViews(workspaceId)

  const rows = companies.data?.rows ?? []
  const count = companies.data?.count ?? 0
  const openCount = Object.keys(jobs.data ?? {}).length
  // Keep the row fresh inside the sheet while realtime updates stream in.
  const openCompany = open && (rows.find(r => r.id === open.company.id) ?? open.company)

  function update(patch: Partial<View>) { setView(v => ({ ...v, ...patch })); setViewId(''); setPage(0) }
  function toggleSort(key: string) {
    update({ sort: { key, dir: view.sort.key === key && view.sort.dir === 'desc' ? 'asc' : 'desc' } })
  }
  function pickView(id: string) {
    const v = views.data?.find(x => x.id === id)
    setViewId(id); setPage(0); setView(v ? v.query : defaultView)
  }
  async function saveView() {
    const name = prompt('Name this view')
    if (name?.trim()) await views.save(name.trim(), view)
  }

  return (
    <>
      <PageHeader title="Companies" meta={<>{count}{openCount > 0 && ` · ${openCount} running`}</>}>
        <button className="btn" disabled={rows.length === 0} onClick={() => exportCsv(rows, properties.data ?? [])}>Export CSV</button>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>Add companies</button>
      </PageHeader>

      <div className="flex items-center gap-2 px-6 pb-3 min-h-10">
        {selected.size > 0 ? (
          <BulkBar workspaceId={workspaceId} ids={[...selected]} rows={rows} columns={columns} onDone={() => setSelected(new Set())} />
        ) : (
          <>
            <select className="input w-44" value={viewId} aria-label="Saved view" onChange={e => pickView(e.target.value)}>
              <option value="">{viewId === '' && view !== defaultView ? 'Custom view' : 'All companies'}</option>
              {views.data?.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {viewId ? (
              <button className="btn" onClick={() => { views.remove(viewId); pickView('') }}>Delete view</button>
            ) : view !== defaultView && (
              <button className="btn" onClick={saveView}>Save view</button>
            )}
            <label className="flex items-center gap-1.5 text-label-2 ml-2">
              Fit ≥
              <input type="number" min="0" max="100" step="5" className="input w-16 tabular-nums" aria-label="Minimum ICP score"
                value={view.minScore ?? ''} onChange={e => update({ minScore: e.target.value === '' ? null : Number(e.target.value) })} />
            </label>
            <input type="search" className="input w-56 ml-auto" placeholder="Filter by domain" value={view.search}
              onChange={e => update({ search: e.target.value })} aria-label="Filter by domain" />
          </>
        )}
      </div>

      {companies.error && <p role="alert" className="mx-6 mb-4 text-red">{companies.error.message}</p>}

      {count === 0 && !companies.isPending && view === defaultView ? (
        <EmptyState onAdd={() => setAdding(true)} />
      ) : (
        <div className="flex-1 overflow-auto bg-surface border-t border-separator">
          <table className="border-collapse w-max min-w-full">
            <thead className="sticky top-0 z-[5] bg-surface">
              <tr>
                <th className="th w-9 pl-4 sticky left-0 bg-surface z-[6]">
                  <input type="checkbox" aria-label="Select all on this page" checked={rows.length > 0 && rows.every(r => selected.has(r.id))}
                    onChange={e => setSelected(e.target.checked ? new Set(rows.map(r => r.id)) : new Set())} />
                </th>
                <th className="th w-60 sticky left-9 bg-surface z-[6]">
                  <SortButton label="Domain" sortKey="domain" sort={view.sort} onSort={toggleSort} />
                </th>
                {columns.map(p => (
                  <th key={p.id} className="th">
                    <ColumnHeader property={p} rows={rows} sort={view.sort} onSort={toggleSort} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id} className={`border-b border-separator hover:bg-fill h-9 ${selected.has(c.id) ? 'bg-fill' : 'odd:bg-surface-2/40'}`}>
                  <td className="pl-4 sticky left-0 bg-inherit z-[4]">
                    <input type="checkbox" aria-label={`Select ${c.domain}`} checked={selected.has(c.id)}
                      onChange={e => setSelected(s => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n })} />
                  </td>
                  <td className="pr-3 max-w-60 sticky left-9 bg-inherit z-[4]">
                    <Link to="/companies/$id" params={{ id: c.id }} className="flex items-center gap-2.5 min-w-0 hover:underline">
                      <Logo src={c.props.logo as string | undefined} domain={c.domain} />
                      <span className="mono font-medium truncate">{c.domain}</span>
                    </Link>
                  </td>
                  {columns.map(p => (
                    <td key={p.id} className="p-0 max-w-72 border-l border-separator/60">
                      <Cell company={c} property={p} meta={c.meta[p.key]}
                        job={jobs.data?.[`${c.id}:${p.key}`]} onOpen={() => setOpen({ company: c, property: p })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !companies.isPending && <p className="p-6 text-label-2">No companies match this view.</p>}
          {count > PAGE_SIZE && (
            <nav className="flex items-center gap-2 p-3 text-label-2" aria-label="Pagination">
              <button className="btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button>
              <span>{page * PAGE_SIZE + 1}–{Math.min(count, (page + 1) * PAGE_SIZE)} of {count}</span>
              <button className="btn" disabled={(page + 1) * PAGE_SIZE >= count} onClick={() => setPage(p => p + 1)}>Next</button>
            </nav>
          )}
        </div>
      )}

      {adding && <AddCompaniesSheet workspaceId={workspaceId} onClose={() => setAdding(false)} />}
      {open && openCompany && (
        <RunSheet company={openCompany} property={open.property}
          job={jobs.data?.[`${openCompany.id}:${open.property.key}`]} onClose={() => setOpen(null)} />
      )}
    </>
  )
}

/** Actions on the selected rows: run any enrichment column, or open deals in the first stage. */
function BulkBar({ workspaceId, ids, rows, columns, onDone }: { workspaceId: string; ids: string[]; rows: Company[]; columns: Property[]; onDone: () => void }) {
  const stages = useStages(workspaceId)
  const qc = useQueryClient()
  const [error, setError] = useState('')
  async function createDeals() {
    const stage = stages.data?.[0]
    if (!stage) return
    const { error } = await supabase.from('deals').insert(ids.map(id => {
      const c = rows.find(r => r.id === id)!
      return { workspace_id: workspaceId, company_id: id, stage_id: stage.id, title: (c.props.name as string) || c.domain }
    }))
    if (error) { setError(error.message); return }
    qc.invalidateQueries({ queryKey: ['deals'] })
    onDone()
  }
  return (
    <>
      <span className="font-medium">{ids.length} selected</span>
      <details className="relative">
        <summary className="btn list-none cursor-pointer [&::-webkit-details-marker]:hidden">Run column ▾</summary>
        <menu className="absolute left-0 top-full mt-1 min-w-44 card shadow-lg p-1 z-20">
          {columns.filter(p => p.source !== 'input').map(p => (
            <li key={p.id}><MenuButton onClick={() => { enqueue(ids, [p.key]); onDone() }}>{p.label}</MenuButton></li>
          ))}
        </menu>
      </details>
      <button className="btn" disabled={!stages.data?.length} onClick={createDeals}>Create deals in {stages.data?.[0]?.name ?? '…'}</button>
      <button className="btn" onClick={onDone}>Clear</button>
      {error && <span role="alert" className="text-red">{error}</span>}
    </>
  )
}

function SortButton({ label, sortKey, sort, onSort }: { label: string; sortKey: string; sort: View['sort']; onSort: (key: string) => void }) {
  const active = sort.key === sortKey
  return (
    <button type="button" className={`px-2 h-full inline-flex items-center gap-1 hover:text-label ${active ? 'text-label' : ''}`}
      onClick={() => onSort(sortKey)} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      title={`Sort by ${label}`}>
      {label}
      {active && <span aria-hidden className="text-[10px]">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  )
}

/** Column label (click to sort) plus a run menu for enrichment columns. */
function ColumnHeader({ property, rows, sort, onSort }: { property: Property; rows: Company[]; sort: View['sort']; onSort: (key: string) => void }) {
  const label = <SortButton label={property.label} sortKey={property.key} sort={sort} onSort={onSort} />
  if (property.source === 'input') return label
  const empty = rows.filter(r => !r.meta[property.key] || r.meta[property.key]?.status !== 'done').map(r => r.id)
  return (
    <span className="inline-flex items-center">
      {label}
      <details className="relative group">
        <summary className="list-none cursor-pointer px-1 text-label-3 hover:text-label group-open:text-label [&::-webkit-details-marker]:hidden" aria-label={`Actions for ${property.label}`}>▾</summary>
        <menu className="absolute left-0 top-full mt-1 min-w-44 card shadow-lg p-1 z-20 font-normal">
          <li><MenuButton onClick={() => enqueue(empty, [property.key])} disabled={empty.length === 0}>
            Run {empty.length} empty cell{empty.length === 1 ? '' : 's'}</MenuButton></li>
          <li><MenuButton onClick={() => enqueue(rows.map(r => r.id), [property.key])} disabled={rows.length === 0}>
            Run all {rows.length} on this page</MenuButton></li>
        </menu>
      </details>
    </span>
  )
}

function MenuButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props}
    className="w-full text-left px-2 py-1 rounded-ctl hover:bg-accent hover:text-accent-fg disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-label"
    onClick={e => { props.onClick?.(e); (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open') }} />
}

/** shortcut: exports the current page (50 rows); use the REST API for a full dump. */
function exportCsv(rows: Company[], properties: Property[]) {
  const csv = toCsv(['domain', ...properties.map(p => p.key)], rows.map(r => [r.domain, ...properties.map(p => r.props[p.key])]))
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = `companies-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex-1 grid place-items-center p-8 text-center">
      <div className="max-w-sm">
        <h2 className="title">No companies yet</h2>
        <p className="text-label-2 mt-1 mb-4">Paste a list of domains. Every enrichment column fills itself in; click a cell to see where the value came from.</p>
        <button className="btn btn-primary" onClick={onAdd}>Add companies</button>
      </div>
    </div>
  )
}
