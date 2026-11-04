import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useWorkspace } from '../_app'
import { supabase } from '../../lib/supabase'
import { useProperties, useRealtime } from '../../lib/queries'

export const Route = createFileRoute('/_app/dashboard')({ component: DashboardPage })

type Stats = {
  companies: number; contacts: number; open_jobs: number; runs: number; tokens: number; cost_cents: number
  avg_icp: number | null; coverage: Record<string, number>; stages: { name: string; count: number; amount: number }[]; playbook_fires: number
}

const money = new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('en')

function DashboardPage() {
  const ws = useWorkspace().data!
  useRealtime(ws.id)
  const properties = useProperties(ws.id)
  const stats = useQuery({
    queryKey: ['stats', ws.id],
    refetchInterval: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('workspace_stats', { p_workspace: ws.id })
      if (error) throw error
      return data as Stats
    },
  })
  const s = stats.data

  return (
    <>
      <header className="flex items-center gap-2 px-4 h-12 border-b border-separator bg-surface">
        <h1 className="font-semibold">Dashboard</h1>
        {s && s.open_jobs > 0 && <span className="text-label-2">{s.open_jobs} cells running</span>}
      </header>
      {stats.error && <p role="alert" className="m-4 text-red">{stats.error.message}</p>}
      {s && (
        <div className="p-4 flex flex-col gap-4 max-w-5xl">
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" aria-label="Key numbers">
            <Tile label="Companies" value={num.format(s.companies)} />
            <Tile label="Contacts" value={num.format(s.contacts)} />
            <Tile label="Avg. ICP score" value={s.avg_icp == null ? '—' : String(s.avg_icp)} hint="of scored companies" />
            <Tile label="Playbook fires" value={num.format(s.playbook_fires)} />
            <Tile label="Provider runs" value={num.format(s.runs)} />
            <Tile label="AI spend" value={s.cost_cents >= 100 ? money.format(s.cost_cents / 100) : `${s.cost_cents.toFixed(2)} ¢`} hint={`${num.format(s.tokens)} tokens`} />
          </section>

          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <Bars title="Pipeline by stage" rows={s.stages.map(st => ({ label: st.name, value: st.count, detail: st.amount ? money.format(st.amount) : undefined }))} unit="deals" />
            <Bars title="Enrichment coverage" unit="of companies"
              rows={(properties.data ?? []).filter(p => p.source !== 'input').map(p => ({
                label: p.label, value: s.coverage[p.key] ?? 0, max: s.companies,
                detail: s.companies ? `${Math.round(((s.coverage[p.key] ?? 0) / s.companies) * 100)}%` : undefined,
              }))} />
          </div>
        </div>
      )}
    </>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-3 flex flex-col gap-0.5">
      <span className="text-label-2">{label}</span>
      <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
      {hint && <span className="text-label-3 text-xs">{hint}</span>}
    </div>
  )
}

/** One series, so one hue: horizontal bars with the value as a direct label and a table-like row per item. */
function Bars({ title, rows, unit, }: { title: string; unit: string; rows: { label: string; value: number; max?: number; detail?: string }[] }) {
  const max = Math.max(1, ...rows.map(r => r.max ?? r.value))
  return (
    <section className="card p-3" aria-label={title}>
      <h2 className="font-semibold mb-2">{title} <span className="text-label-2 font-normal">({unit})</span></h2>
      {rows.length === 0 ? <p className="text-label-2">Nothing to show yet.</p> : (
        <table className="w-full border-separate border-spacing-y-1">
          <tbody>
            {rows.map(r => (
              <tr key={r.label} title={`${r.label}: ${r.value}${r.detail ? ` · ${r.detail}` : ''}`}>
                <th scope="row" className="text-left font-normal text-label-2 w-32 truncate pr-2">{r.label}</th>
                <td className="w-full">
                  <div className="h-4 bg-fill rounded-[4px] overflow-hidden">
                    <div className="h-full bg-accent rounded-[4px] transition-[width] duration-300" style={{ width: `${(r.value / max) * 100}%` }} />
                  </div>
                </td>
                <td className="pl-2 tabular-nums text-right whitespace-nowrap">{r.value}{r.detail && <span className="text-label-2"> · {r.detail}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
