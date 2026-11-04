import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'
import type { Condition, Action } from '../../supabase/functions/_shared/playbooks.ts'

export type Stage = { id: string; pipeline_id: string; name: string; position: number; outcome: 'won' | 'lost' | null }
export type Deal = {
  id: string; company_id: string; stage_id: string; title: string; amount: number | null; updated_at: string
  companies?: { domain: string; props: Record<string, unknown> }
}
export type Contact = { id: string; company_id: string; first_name: string; last_name: string; email: string | null; title: string | null; linkedin: string | null }
export type Activity = { id: string; company_id: string; deal_id: string | null; kind: 'note' | 'system'; body: string; meta: Record<string, unknown>; created_at: string }
export type Playbook = { id: string; name: string; enabled: boolean; trigger_key: string; condition: Condition; actions: Action[] }
export type PlaybookRun = { id: string; playbook_id: string; company_id: string; matched: boolean; result: unknown[]; error: string | null; created_at: string; companies?: { domain: string } }

const q = <T,>(key: unknown[], fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) =>
  useQuery({ queryKey: key, queryFn: async () => { const { data, error } = await fn(); if (error) throw error; return data as T } })

export const useStages = (ws: string) =>
  q<Stage[]>(['stages', ws], () => supabase.from('stages').select('*').eq('workspace_id', ws).order('position'))

export const useDeals = (ws: string) =>
  q<Deal[]>(['deals', ws], () => supabase.from('deals').select('*, companies(domain, props)').eq('workspace_id', ws).order('updated_at', { ascending: false }))

export const useCompanyDeals = (companyId: string) =>
  q<Deal[]>(['deals', 'company', companyId], () => supabase.from('deals').select('*').eq('company_id', companyId).order('created_at'))

export const useContacts = (companyId: string) =>
  q<Contact[]>(['contacts', companyId], () => supabase.from('contacts').select('*').eq('company_id', companyId).order('created_at'))

export const useActivities = (companyId: string) =>
  q<Activity[]>(['activities', companyId], () => supabase.from('activities').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(100))

export const usePlaybooks = (ws: string) =>
  q<Playbook[]>(['playbooks', ws], () => supabase.from('playbooks').select('*').eq('workspace_id', ws).order('created_at'))

export const usePlaybookRuns = (ws: string) =>
  q<PlaybookRun[]>(['playbook_runs', ws], () => supabase.from('playbook_runs').select('*, companies(domain)').eq('workspace_id', ws).order('created_at', { ascending: false }).limit(50))

export const useCompany = (id: string) =>
  q<import('../../supabase/functions/_shared/types.ts').Company>(['company', id], () => supabase.from('companies').select('*').eq('id', id).single())
