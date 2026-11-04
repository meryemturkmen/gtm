import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useWorkspace } from '../_app'
import { supabase } from '../../lib/supabase'
import { useDeals, useStages, type Deal, type Stage } from '../../lib/crm'
import { useRealtime } from '../../lib/queries'

export const Route = createFileRoute('/_app/deals')({ component: DealsPage })

const money = new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

function DealsPage() {
  const ws = useWorkspace().data!
  useRealtime(ws.id)
  const stages = useStages(ws.id)
  const deals = useDeals(ws.id)
  const qc = useQueryClient()
  const [dragging, setDragging] = useState<string | null>(null)

  const move = useMutation({
    mutationFn: async ({ id, stage_id }: { id: string; stage_id: string }) => {
      const { error } = await supabase.from('deals').update({ stage_id }).eq('id', id)
      if (error) throw error
    },
    onMutate: ({ id, stage_id }) => {
      qc.setQueryData<Deal[]>(['deals', ws.id], old => old?.map(d => d.id === id ? { ...d, stage_id } : d))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['deals', ws.id] }),
  })

  const total = (deals.data ?? []).filter(d => !stages.data?.find(s => s.id === d.stage_id)?.outcome).reduce((s, d) => s + (d.amount ?? 0), 0)

  return (
    <>
      <header className="flex items-center gap-2 px-4 h-12 border-b border-separator bg-surface">
        <h1 className="font-semibold">Deals</h1>
        <span className="text-label-2">{deals.data?.length ?? 0} · {money.format(total)} open</span>
        {move.error && <span role="alert" className="text-red ml-auto">{move.error.message}</span>}
      </header>
      {deals.error && <p role="alert" className="m-4 text-red">{deals.error.message}</p>}
      {deals.data?.length === 0 ? (
        <div className="flex-1 grid place-items-center p-8 text-center">
          <div className="max-w-sm">
            <h2 className="text-lg font-semibold">No deals yet</h2>
            <p className="text-label-2 mt-1">Deals appear here when a playbook qualifies a company, or when you add one on a company page.</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto flex gap-3 p-4 items-start">
          {stages.data?.map(stage => (
            <Column key={stage.id} stage={stage} dragging={dragging}
              deals={(deals.data ?? []).filter(d => d.stage_id === stage.id)}
              onDrop={id => { move.mutate({ id, stage_id: stage.id }); setDragging(null) }}
              onDragStart={setDragging} />
          ))}
        </div>
      )}
    </>
  )
}

function Column({ stage, deals, dragging, onDrop, onDragStart }: {
  stage: Stage; deals: Deal[]; dragging: string | null; onDrop: (id: string) => void; onDragStart: (id: string | null) => void
}) {
  const [over, setOver] = useState(false)
  const sum = deals.reduce((s, d) => s + (d.amount ?? 0), 0)
  return (
    <section
      aria-label={stage.name}
      className={`w-60 shrink-0 rounded-card p-2 flex flex-col gap-2 transition-colors ${over ? 'bg-accent/10' : 'bg-surface-2/70'}`}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData('text/deal'); if (id) onDrop(id) }}
    >
      <header className="flex items-baseline justify-between px-1">
        <h2 className="font-medium">{stage.name} <span className="text-label-2 font-normal">{deals.length}</span></h2>
        {sum > 0 && <span className="text-label-2 tabular-nums">{money.format(sum)}</span>}
      </header>
      {deals.map(d => (
        <article key={d.id} draggable
          onDragStart={e => { e.dataTransfer.setData('text/deal', d.id); onDragStart(d.id) }}
          onDragEnd={() => onDragStart(null)}
          className={`card p-2.5 cursor-grab active:cursor-grabbing ${dragging === d.id ? 'opacity-40' : ''}`}>
          <Link to="/companies/$id" params={{ id: d.company_id }} className="font-medium hover:underline">{d.title}</Link>
          <div className="text-label-2 flex justify-between mt-0.5">
            <span className="truncate">{d.companies?.domain}</span>
            {d.amount != null && <span className="tabular-nums">{money.format(d.amount)}</span>}
          </div>
        </article>
      ))}
      {deals.length === 0 && <p className="text-label-3 px-1 py-3 text-center">Drop deals here</p>}
    </section>
  )
}
