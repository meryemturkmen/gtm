import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useWorkspace } from '../_app'
import { PAGE_SIZE, enqueue, useCompanies, useOpenJobs, useProperties, useRealtime } from '../../lib/queries'
import { Cell } from '../../components/Cell'
import { RunSheet } from '../../components/RunSheet'
import { AddCompaniesSheet } from '../../components/AddCompaniesSheet'
import { toCsv } from '../../lib/csv'
import type { Company, Property } from '../../../supabase/functions/_shared/types.ts'

export const Route = createFileRoute('/_app/companies')({ component: CompaniesPage })

function CompaniesPage() {
  const ws = useWorkspace().data!
  return <CompaniesTable workspaceId={ws.id} />
}

function CompaniesTable({ workspaceId }: { workspaceId: string }) {
  useRealtime(workspaceId)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<{ company: Company; property: Property } | null>(null)

  const properties = useProperties(workspaceId)
  const companies = useCompanies(workspaceId, search, page)
  const jobs = useOpenJobs(workspaceId)

  const rows = companies.data?.rows ?? []
  const count = companies.data?.count ?? 0
  const openCount = Object.keys(jobs.data ?? {}).length
  // Keep the row fresh inside the sheet while realtime updates stream in.
  const openCompany = open && (rows.find(r => r.id === open.company.id) ?? open.company)

  return (
    <>
      <header className="flex items-center gap-2 px-4 h-12 border-b border-separator bg-surface sticky top-0 z-10">
        <h1 className="font-semibold">Companies</h1>
        <span className="text-label-2">{count}{openCount > 0 && ` · ${openCount} running`}</span>
        <input type="search" className="input ml-auto w-56" placeholder="Filter by domain" value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }} aria-label="Filter by domain" />
        <button className="btn" disabled={rows.length === 0} onClick={() => exportCsv(rows, properties.data ?? [])}>Export CSV</button>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>Add companies</button>
      </header>

      {companies.error && <p role="alert" className="m-4 text-red">{companies.error.message}</p>}

      {count === 0 && !companies.isPending && !search ? (
        <EmptyState onAdd={() => setAdding(true)} />
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse w-max min-w-full">
            <thead className="sticky top-0 z-[5] bg-surface-2">
              <tr>
                <th className="th w-56 sticky left-0 bg-surface-2 z-[6]">Domain</th>
                {properties.data?.map(p => (
                  <th key={p.id} className="th">
                    <ColumnHeader property={p} rows={rows} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id} className="border-b border-separator hover:bg-surface-2/50 h-8">
                  <td className="px-3 font-medium truncate max-w-56 sticky left-0 bg-surface z-[4]"><Link to="/companies/$id" params={{ id: c.id }} className="hover:underline">{c.domain}</Link></td>
                  {properties.data?.map(p => (
                    <td key={p.id} className="p-0 max-w-72 border-l border-separator/60">
                      <Cell company={c} property={p} meta={c.meta[p.key]}
                        job={jobs.data?.[`${c.id}:${p.key}`]} onOpen={() => setOpen({ company: c, property: p })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
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

/** Column label plus a run menu for enrichment columns. */
function ColumnHeader({ property, rows }: { property: Property; rows: Company[] }) {
  if (property.source === 'input') return <span className="px-2">{property.label}</span>
  const empty = rows.filter(r => !r.meta[property.key] || r.meta[property.key]?.status !== 'done').map(r => r.id)
  return (
    <details className="relative group">
      <summary className="list-none cursor-pointer px-2 flex items-center gap-1 marker:hidden [&::-webkit-details-marker]:hidden">
        {property.label}
        <span className="text-label-3 group-open:text-label" aria-hidden>▾</span>
      </summary>
      <menu className="absolute left-0 top-full mt-1 min-w-44 card shadow-lg p-1 z-20 font-normal">
        <li><MenuButton onClick={() => enqueue(empty, [property.key])} disabled={empty.length === 0}>
          Run {empty.length} empty cell{empty.length === 1 ? '' : 's'}</MenuButton></li>
        <li><MenuButton onClick={() => enqueue(rows.map(r => r.id), [property.key])} disabled={rows.length === 0}>
          Run all {rows.length} on this page</MenuButton></li>
      </menu>
    </details>
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
        <h2 className="text-lg font-semibold">No companies yet</h2>
        <p className="text-label-2 mt-1 mb-4">Paste a list of domains. Every enrichment column fills itself in; click a cell to see where the value came from.</p>
        <button className="btn btn-primary" onClick={onAdd}>Add companies</button>
      </div>
    </div>
  )
}
