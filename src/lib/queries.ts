import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Company, Job, Property, Run } from '../../supabase/functions/_shared/types.ts'

export const PAGE_SIZE = 50

export function useProperties(workspaceId: string) {
  return useQuery({
    queryKey: ['properties', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('*')
        .eq('workspace_id', workspaceId).order('position').order('created_at')
      if (error) throw error
      return data as Property[]
    },
  })
}

export function useCompanies(workspaceId: string, search: string, page: number) {
  return useQuery({
    queryKey: ['companies', workspaceId, search, page],
    queryFn: async () => {
      let q = supabase.from('companies').select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId).order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      if (search) q = q.ilike('domain', `%${search}%`)
      const { data, error, count } = await q
      if (error) throw error
      return { rows: data as Company[], count: count ?? 0 }
    },
    placeholderData: prev => prev,
  })
}

/** Open jobs keyed by "companyId:propertyKey" so cells can show queued/running. */
export function useOpenJobs(workspaceId: string) {
  return useQuery({
    queryKey: ['jobs', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from('jobs').select('*')
        .eq('workspace_id', workspaceId).in('status', ['queued', 'running'])
      if (error) throw error
      return Object.fromEntries((data as Job[]).map(j => [`${j.company_id}:${j.property_key}`, j]))
    },
  })
}

export function useRun(runId: string | undefined) {
  return useQuery({
    queryKey: ['run', runId],
    enabled: !!runId,
    queryFn: async () => {
      const { data, error } = await supabase.from('runs').select('*').eq('id', runId!).single()
      if (error) throw error
      return data as Run
    },
  })
}

/** One Realtime channel per workspace; any change to companies or jobs refreshes the table. */
export function useRealtime(workspaceId: string) {
  const qc = useQueryClient()
  useEffect(() => {
    const channel = supabase.channel(`ws:${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies', filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ['companies', workspaceId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ['jobs', workspaceId] }))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [workspaceId, qc])
}

/** Fire-and-forget poke of the worker so a demo feels instant; cron is the safety net. */
export function pokeWorker() {
  supabase.functions.invoke('run-jobs', { method: 'POST' }).catch(() => {})
}

export async function enqueue(companyIds: string[], keys: string[]) {
  const { data, error } = await supabase.rpc('enqueue', { p_company_ids: companyIds, p_keys: keys })
  if (error) throw error
  if (data > 0) pokeWorker()
  return data as number
}

export async function addCompanies(workspaceId: string, domains: string[]) {
  const { data, error } = await supabase.rpc('upsert_companies', { p_workspace: workspaceId, p_domains: domains })
  if (error) throw error
  if (data.length > 0) pokeWorker()
  return data as Company[]
}
