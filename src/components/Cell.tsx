import type { CellMeta, Job, Property } from '../../supabase/functions/_shared/types.ts'

type Props = { property: Property; value: unknown; meta?: CellMeta; job?: Job; onOpen: () => void }

/** Status dot + value. Clickable when there is provenance to show. */
export function Cell({ property, value, meta, job, onOpen }: Props) {
  const status = job?.status ?? meta?.status
  const clickable = property.source !== 'input' && (meta || job)
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onOpen}
      title={job?.last_error ?? meta?.error ?? (status && `${status} · ${meta?.provider ?? ''}`)}
      className="group flex items-center gap-1.5 w-full h-full px-2 text-left truncate disabled:cursor-default enabled:hover:bg-fill"
    >
      {status && <StatusDot status={status} />}
      <span className="truncate">{format(property, value)}</span>
    </button>
  )
}

export function StatusDot({ status }: { status: Job['status'] | CellMeta['status'] }) {
  const cls = {
    queued: 'bg-label-3', running: 'bg-orange animate-pulse', done: 'bg-green', empty: 'bg-label-3', failed: 'bg-red',
  }[status]
  return <span aria-label={status} className={`inline-block size-1.5 rounded-full shrink-0 ${cls}`} />
}

function format(p: Property, v: unknown): React.ReactNode {
  if (v == null || v === '') return <span className="text-label-3">—</span>
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
      return typeof v === 'object' ? JSON.stringify(v) : String(v)
  }
}
