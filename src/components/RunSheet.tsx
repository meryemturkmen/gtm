import { Sheet } from './Sheet'
import { StatusDot } from './Cell'
import { enqueue, useRun } from '../lib/queries'
import type { Company, Job, Property } from '../../supabase/functions/_shared/types.ts'

type Props = { company: Company; property: Property; job?: Job; onClose: () => void }

/** Provenance of one cell: where the value came from, what it cost, the raw output, and a retry. */
export function RunSheet({ company, property, job, onClose }: Props) {
  const meta = company.meta[property.key]
  const run = useRun(meta?.run_id)
  const status = job?.status ?? meta?.status
  return (
    <Sheet title={`${property.label} · ${company.domain}`} onClose={onClose}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-label-2">Status</dt>
        <dd className="flex items-center gap-1.5">{status && <StatusDot status={status} />}{status ?? 'not run'}</dd>
        {meta?.provider && <><dt className="text-label-2">Provider</dt><dd className="font-mono">{meta.provider}</dd></>}
        {meta?.at && <><dt className="text-label-2">When</dt><dd>{new Date(meta.at).toLocaleString()}</dd></>}
        {run.data && <>
          <dt className="text-label-2">Took</dt><dd>{run.data.duration_ms} ms</dd>
          {run.data.tokens > 0 && <><dt className="text-label-2">Tokens</dt><dd>{run.data.tokens} · {run.data.cost_cents.toFixed(3)} ¢</dd></>}
        </>}
      </dl>
      {(job?.last_error || meta?.error) && (
        <p role="alert" className="text-red bg-red/10 rounded-ctl p-2 break-words">{job?.last_error ?? meta?.error}</p>
      )}
      <div>
        <h3 className="text-label-2 mb-1">Value</h3>
        <pre className="font-mono text-xs bg-surface-2 rounded-ctl p-2 whitespace-pre-wrap break-words">
          {JSON.stringify(company.props[property.key] ?? null, null, 2)}
        </pre>
      </div>
      {run.data && (
        <div>
          <h3 className="text-label-2 mb-1">Raw provider output</h3>
          <pre className="font-mono text-xs bg-surface-2 rounded-ctl p-2 whitespace-pre-wrap break-words max-h-80 overflow-auto">
            {JSON.stringify(run.data.output, null, 2)}
          </pre>
        </div>
      )}
      <button className="btn self-start" disabled={!!job} onClick={() => enqueue([company.id], [property.key])}>
        Run again
      </button>
    </Sheet>
  )
}
