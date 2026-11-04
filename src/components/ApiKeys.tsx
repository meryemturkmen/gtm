import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

type ApiKey = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null }

export function ApiKeys({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const keys = useQuery({
    queryKey: ['api_keys', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from('api_keys').select('id, name, prefix, created_at, last_used_at').eq('workspace_id', workspaceId).order('created_at')
      if (error) throw error
      return data as ApiKey[]
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['api_keys', workspaceId] })
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_api_key', { p_workspace: workspaceId, p_name: name })
      if (error) throw error
      return data as string
    },
    onSuccess: raw => { setFresh(raw); setName(''); refresh() },
  })
  const revoke = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('api_keys').delete().eq('id', id); if (error) throw error },
    onSuccess: refresh,
  })
  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest`

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">API keys</h2>
      <p className="text-label-2">Push companies in from forms, Zapier, n8n or a CRM export. Every row is enriched automatically.</p>
      <ul className="card divide-y divide-separator">
        {keys.data?.map(k => (
          <li key={k.id} className="flex items-center gap-3 px-3 h-9">
            <span className="w-40 truncate">{k.name}</span>
            <code className="font-mono text-label-2">{k.prefix}…</code>
            <span className="text-label-2 flex-1 truncate">{k.last_used_at ? `used ${new Date(k.last_used_at).toLocaleString()}` : 'never used'}</span>
            <button className="btn" onClick={() => { if (confirm(`Revoke "${k.name}"?`)) revoke.mutate(k.id) }}>Revoke</button>
          </li>
        ))}
        {keys.data?.length === 0 && <li className="px-3 py-3 text-label-2">No keys yet.</li>}
      </ul>
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); create.mutate() }}>
        <input className="input w-64" required placeholder="Key name, e.g. website form" aria-label="Key name" value={name} onChange={e => setName(e.target.value)} />
        <button className="btn btn-primary" disabled={create.isPending}>Create key</button>
      </form>
      {create.error && <p role="alert" className="text-red">{create.error.message}</p>}
      {fresh && (
        <div className="card p-3 flex flex-col gap-2 border-accent">
          <p><b>Copy this key now.</b> It is shown once; only a hash is stored.</p>
          <code className="font-mono select-all bg-surface-2 rounded-ctl p-2 break-all">{fresh}</code>
          <pre className="font-mono text-xs bg-surface-2 rounded-ctl p-2 overflow-x-auto">{`curl -X POST ${endpoint} \\
  -H "x-api-key: ${fresh}" -H "content-type: application/json" \\
  -d '{"domains": ["acme.de", "example.com"]}'`}</pre>
          <button className="btn self-start" onClick={() => setFresh(null)}>Done</button>
        </div>
      )}
      {!fresh && (
        <pre className="font-mono text-xs bg-surface-2 rounded-ctl p-2 overflow-x-auto">{`curl -X POST ${endpoint} \\
  -H "x-api-key: <key>" -H "content-type: application/json" \\
  -d '{"domains": ["acme.de", "example.com"]}'`}</pre>
      )}
    </section>
  )
}
