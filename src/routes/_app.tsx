import { createFileRoute, Link, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useOpenJobs } from '../lib/queries'
import type { Workspace } from '../../supabase/functions/_shared/types.ts'

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw redirect({ to: '/login' })
    return { userId: data.session.user.id }
  },
  component: AppShell,
})

/* 16px stroke symbols, one visual language (HIG icons.md: match the weight of adjacent text). */
const icons = {
  overview: <path d="M2 9h3l2-5 3 10 2-7 1.5 2H14" />,
  companies: <><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M2 7h12M6 3v10" /></>,
  deals: <><rect x="2" y="2.5" width="3" height="11" rx="1" /><rect x="6.5" y="2.5" width="3" height="8" rx="1" /><rect x="11" y="2.5" width="3" height="5" rx="1" /></>,
  playbooks: <path d="M9 1.5 4 9h4l-1 5.5L13 7H9l0-5.5z" strokeLinejoin="round" />,
  settings: <><path d="M2 5h12M2 11h12" /><circle cx="6" cy="5" r="1.6" fill="currentColor" stroke="none" /><circle cx="10" cy="11" r="1.6" fill="currentColor" stroke="none" /></>,
}

const nav = [
  { to: '/dashboard', label: 'Overview', icon: icons.overview },
  { to: '/companies', label: 'Companies', icon: icons.companies },
  { to: '/deals', label: 'Deals', icon: icons.deals },
  { to: '/playbooks', label: 'Playbooks', icon: icons.playbooks },
  { to: '/settings', label: 'Settings', icon: icons.settings },
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
      <aside className="w-56 shrink-0 flex flex-col px-3 py-4 gap-0.5 border-r border-separator bg-surface-2/50">
        <div className="flex items-center gap-2.5 px-2 mb-4 min-w-0">
          <span aria-hidden className="size-6 rounded-[6px] bg-accent text-accent-fg grid place-items-center font-semibold text-[12px]">
            {ws.data.name.trim().charAt(0).toUpperCase() || 'W'}
          </span>
          <span className="font-semibold truncate" title={ws.data.name}>{ws.data.name}</span>
        </div>
        {nav.map(n => (
          <Link key={n.to} to={n.to}
            className="flex items-center gap-2.5 h-7 px-2 rounded-ctl hover:bg-fill"
            activeProps={{ className: 'bg-accent text-accent-fg hover:bg-accent' }}>
            <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">{n.icon}</svg>
            {n.label}
          </Link>
        ))}
        <div className="mt-auto flex flex-col gap-2 px-2">
          <LiveStatus workspaceId={ws.data.id} />
          <button className="text-label-2 hover:text-label text-left" onClick={async () => {
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

/** What the engine is doing right now, so nobody has to wonder whether anything is happening. */
function LiveStatus({ workspaceId }: { workspaceId: string }) {
  const jobs = useOpenJobs(workspaceId)
  const n = Object.keys(jobs.data ?? {}).length
  return (
    <p className="text-label-2 flex items-center gap-2 h-5" role="status">
      <span aria-hidden className={`size-1.5 rounded-full ${n ? 'bg-orange animate-pulse' : 'bg-green'}`} />
      {n ? `Enriching ${n} cell${n === 1 ? '' : 's'}` : 'Engine idle'}
    </p>
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
          <h1 className="title">Name your workspace</h1>
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
