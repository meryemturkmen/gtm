import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Workspace } from '../../supabase/functions/_shared/types.ts'

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw redirect({ to: '/login' })
    return { userId: data.session.user.id }
  },
  component: AppShell,
})

const nav = [
  { to: '/companies', label: 'Companies' },
  { to: '/settings', label: 'Settings' },
] as const

export function useWorkspace() {
  // shortcut: one workspace per user for now; switcher comes when members > 1 matters.
  return useQuery({
    queryKey: ['workspace'],
    queryFn: async () => {
      const { data, error } = await supabase.from('workspaces').select('*').order('created_at').limit(1)
      if (error) throw error
      return (data[0] ?? null) as Workspace | null
    },
  })
}

function AppShell() {
  const ws = useWorkspace()
  const navigate = useNavigate()

  if (ws.isPending) return <Centered>Loading…</Centered>
  if (ws.error) return <Centered><span role="alert" className="text-red">{ws.error.message}</span></Centered>
  if (!ws.data) return <CreateWorkspace onCreated={() => ws.refetch()} />

  return (
    <div className="flex min-h-dvh">
      <aside className="w-52 shrink-0 border-r border-separator bg-surface-2/60 flex flex-col p-3 gap-1">
        <div className="px-2 py-1 mb-2 font-semibold truncate" title={ws.data.name}>{ws.data.name}</div>
        {nav.map(n => (
          <Link key={n.to} to={n.to}
            className="px-2 py-1 rounded-ctl hover:bg-fill"
            activeProps={{ className: 'bg-accent text-accent-fg hover:bg-accent' }}>
            {n.label}
          </Link>
        ))}
        <div className="mt-auto">
          <button className="btn w-full justify-center" onClick={async () => {
            await supabase.auth.signOut(); navigate({ to: '/login' })
          }}>Sign out</button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}

function CreateWorkspace({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  async function create(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.rpc('create_workspace', { p_name: name })
    if (error) setError(error.message); else onCreated()
  }
  return (
    <Centered>
      <form onSubmit={create} className="card w-full max-w-xs p-6 flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Name your workspace</h1>
          <p className="text-label-2 mt-1">Usually your company or team.</p>
        </div>
        <input className="input" required autoFocus maxLength={80} placeholder="Acme GmbH"
          value={name} onChange={e => setName(e.target.value)} />
        {error && <p role="alert" className="text-red">{error}</p>}
        <button className="btn btn-primary justify-center">Create</button>
      </form>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh grid place-items-center p-4 text-label-2">{children}</div>
}
