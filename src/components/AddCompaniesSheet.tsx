import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Sheet } from './Sheet'
import { addCompanies } from '../lib/queries'
import { domainsFromCsv } from '../lib/csv'

export function AddCompaniesSheet({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const [text, setText] = useState('')
  const [state, setState] = useState<{ busy: boolean; error?: string; added?: number }>({ busy: false })
  const qc = useQueryClient()
  const domains = text.split(/[\s,;]+/).filter(Boolean)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState({ busy: true })
    try {
      const rows = await addCompanies(workspaceId, domains)
      qc.invalidateQueries({ queryKey: ['companies', workspaceId] })
      setState({ busy: false, added: rows.length })
      setText('')
    } catch (err) {
      setState({ busy: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  async function fromFile(file: File | undefined) {
    if (!file) return
    const found = domainsFromCsv(await file.text())
    if (found.length === 0) setState({ busy: false, error: 'No column with domains or URLs found in that file.' })
    else setText(t => [t.trim(), ...found].filter(Boolean).join('\n'))
  }

  return (
    <Sheet title="Add companies" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-label-2">Paste domains or URLs, one per line. Duplicates are skipped.</span>
          <textarea className="input h-56 py-1.5 font-mono resize-y" autoFocus value={text}
            placeholder={'acme.de\nhttps://www.example.com/about'} onChange={e => setText(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-label-2">
          <span>Or import a CSV:</span>
          <input type="file" accept=".csv,text/csv,.txt" className="text-label" onChange={e => fromFile(e.target.files?.[0])} />
        </label>
        {state.error && <p role="alert" className="text-red">{state.error}</p>}
        {state.added !== undefined && <p role="status">Added {state.added} compan{state.added === 1 ? 'y' : 'ies'}. Enrichment is running.</p>}
        <button className="btn btn-primary self-start" disabled={state.busy || domains.length === 0}>
          {state.busy ? 'Adding…' : `Add ${domains.length || ''}`.trim()}
        </button>
      </form>
    </Sheet>
  )
}
