import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useWorkspace } from '../_app'
import { supabase } from '../../lib/supabase'
import { useProperties, useRealtime } from '../../lib/queries'
import { PageHeader } from '../../components/PageHeader'

export const Route = createFileRoute('/_app/dashboard')({ component: OverviewPage })

type Stats = {
  companies: number; contacts: number; open_jobs: number; runs: number; tokens: number; cost_cents: number
  avg_icp: number | null; coverage: Record<string, number>; stages: { name: string; count: number; amount: number }[]; playbook_fires: number
}

const money = new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const num = new Intl.NumberFormat('en')

/** Not a wall of tiles: one line of numbers, the pipeline as one bar, coverage as a list. */
function OverviewPage() {
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
  const scored = s ? (s.coverage.icp_score ?? 0) : 0

  return (
    <>
      <PageHeader title="Overview" meta={s && s.open_jobs > 0 ? `${s.open_jobs} cells running` : undefined} />
      {stats.error && <p role="alert" className="m-6 text-red">{stats.error.message}</p>}
      {s && (
        <div className="px-6 pb-8 flex flex-col gap-8 max-w-4xl">
          <dl className="flex flex-wrap gap-x-10 gap-y-4" aria-label="Key numbers">
            <Stat label="Companies" value={num.format(s.companies)} to="/companies" />
            <Stat label="Scored" value={s.companies ? `${Math.round((scored / s.companies) * 100)}%` : '—'} hint={`${num.format(scored)} with an ICP score`} />
            <Stat label="Average fit" value={s.avg_icp == null ? '—' : `${s.avg_icp}`} hint="of 100" />
            <Stat label="Qualified" value={num.format(s.playbook_fires)} hint="playbook fires" to="/playbooks" />
            <Stat label="Provider runs" value={num.format(s.runs)} />
            <Stat label="AI spend" value={s.cost_cents >= 100 ? money.format(s.cost_cents / 100) : `${s.cost_cents.toFixed(2)} ¢`} hint={`${num.format(s.tokens)} tokens`} />
          </dl>

          <Pipeline stages={s.stages} />

          <section aria-label="Enrichment coverage">
            <h2 className="font-semibold mb-3">Coverage <span className="text-label-2 font-normal">cells filled per column</span></h2>
            <ul className="grid sm:grid-cols-2 gap-x-10 gap-y-2">
              {(properties.data ?? []).filter(p => p.source !== 'input').map(p => {
                const n = s.coverage[p.key] ?? 0
                const pct = s.companies ? Math.round((n / s.companies) * 100) : 0
                return (
                  <li key={p.id} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3">
                    <span className="truncate">{p.label}</span>
                    <span aria-hidden className="h-1.5 rounded-full bg-fill overflow-hidden">
                      <span className="block h-full rounded-full bg-label transition-[width] duration-300" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="tabular-nums text-right text-label-2">{pct}%</span>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      )}
    </>
  )
}

function Stat({ label, value, hint, to }: { label: string; value: string; hint?: string; to?: '/companies' | '/playbooks' }) {
  const body = <>
    <dt className="eyebrow">{label}</dt>
    <dd className="text-[26px] font-semibold tabular-nums tracking-[-0.02em] leading-8">{value}</dd>
    {hint && <dd className="text-label-3 text-[11px]">{hint}</dd>}
  </>
  return to ? <Link to={to} className="group rounded-ctl -mx-1 px-1 hover:bg-fill">{body}</Link> : <div>{body}</div>
}

/** One segmented bar: the stages in order, a 2px gap between segments, direct labels underneath. */
function Pipeline({ stages }: { stages: Stats['stages'] }) {
  const total = stages.reduce((n, st) => n + st.count, 0)
  const open = stages.filter(st => !/^(won|lost)$/i.test(st.name)).reduce((n, st) => n + st.amount, 0)
  const shades = ['bg-label/25', 'bg-label/40', 'bg-label/55', 'bg-label/70', 'bg-green', 'bg-red']
  return (
    <section aria-label="Pipeline">
      <h2 className="font-semibold mb-3">Pipeline <span className="text-label-2 font-normal">{total} deal{total === 1 ? '' : 's'}{open ? ` · ${money.format(open)} open` : ''}</span></h2>
      {total === 0 ? <p className="text-label-2">No deals yet. A playbook opens one when a company qualifies.</p> : (
        <>
          <div className="flex h-3 gap-0.5 rounded-full overflow-hidden" aria-hidden>
            {stages.map((st, i) => st.count > 0 && (
              <span key={st.name} className={`${shades[i % shades.length]} min-w-1`} style={{ flexGrow: st.count }} title={`${st.name}: ${st.count}`} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
            {stages.map((st, i) => (
              <li key={st.name} className="flex items-center gap-1.5">
                <span aria-hidden className={`size-2 rounded-[3px] ${shades[i % shades.length]}`} />
                <span className="text-label-2">{st.name}</span>
                <span className="tabular-nums">{st.count}</span>
                {st.amount > 0 && <span className="text-label-2 tabular-nums">{money.format(st.amount)}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
