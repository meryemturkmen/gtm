import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CellMeta, Company, Job, Property } from '../../supabase/functions/_shared/types.ts'

type Props = { company: Company; property: Property; meta?: CellMeta; job?: Job; onOpen: () => void }

/** Status dot + value. Enrichment cells open their provenance; input cells edit in place. */
export function Cell({ company, property, meta, job, onOpen }: Props) {
  const value = company.props[property.key]
  if (property.source === 'input') return <InputCell company={company} property={property} value={value} />
  const status = job?.status ?? meta?.status
  return (
    <button
      type="button"
      disabled={!meta && !job}
      onClick={onOpen}
      title={job?.last_error ?? meta?.error ?? (status && `${status} · ${meta?.provider ?? ''}`)}
      className="group flex items-center gap-1.5 w-full h-full px-2 text-left truncate disabled:cursor-default enabled:hover:bg-fill"
    >
      {status && <StatusDot status={status} />}
      <span className="truncate">{format(property, value)}</span>
    </button>
  )
}

/** Saves on blur or Enter; Escape reverts. Optimistic: realtime brings the row back in sync. */
function InputCell({ company, property, value }: { company: Company; property: Property; value: unknown }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const [error, setError] = useState('')
  async function save() {
    const next = property.type === 'number' ? (text === '' ? null : Number(text)) : text || null
    if (next === (value ?? null)) return
    const { error } = await supabase.from('companies')
      .update({ props: { ...company.props, [property.key]: next } }).eq('id', company.id)
    setError(error?.message ?? '')
  }
  return (
    <input
      className={`w-full h-full px-2 bg-transparent focus:bg-surface ${error ? 'text-red' : ''}`}
      aria-label={`${property.label} for ${company.domain}`}
      title={error || undefined}
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={save}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setText(value == null ? '' : String(value)); e.currentTarget.blur() }
      }}
    />
  )
}

export function StatusDot({ status }: { status: Job['status'] | CellMeta['status'] }) {
  const cls = {
    queued: 'bg-label-3', running: 'bg-orange animate-pulse', done: 'bg-green', empty: 'bg-label-3', failed: 'bg-red',
  }[status]
  return <span aria-label={status} className={`inline-block size-1.5 rounded-full shrink-0 ${cls}`} />
}

export function format(p: Property, v: unknown): React.ReactNode {
  if (v == null || v === '') return <span className="text-label-3">—</span>
  if (typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>
    // AI answer shapes from waterfall.ts: {score, reason} and {answer, reason}
    if (typeof o.score === 'number') return <><b className="font-semibold tabular-nums">{o.score}</b> <span className="text-label-2">{String(o.reason ?? '')}</span></>
    if (typeof o.answer === 'boolean') return <><b className="font-semibold">{o.answer ? 'Yes' : 'No'}</b> <span className="text-label-2">{String(o.reason ?? '')}</span></>
    return JSON.stringify(v)
  }
  switch (p.type) {
    case 'boolean': return v ? 'Yes' : 'No'
    case 'url':
      return p.key === 'logo' || /\.(png|svg|ico|jpg|webp)|favicons/.test(String(v))
        ? <img src={String(v)} alt="" className="size-4 rounded-sm" loading="lazy" />
        : <a href={String(v)} target="_blank" rel="noreferrer" className="text-accent hover:underline" onClick={e => e.stopPropagation()}>
            {String(v).replace(/^https?:\/\/(www\.)?/, '')}
          </a>
    case 'json':
      return Array.isArray(v) ? v.join(', ') : JSON.stringify(v)
    default:
      return String(v)
  }
}
