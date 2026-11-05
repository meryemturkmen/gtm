import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

/** Table state worth saving: a search, a sort, and a minimum fit score. */
export type View = { search: string; sort: { key: string; dir: 'asc' | 'desc' }; minScore: number | null }
export type SavedView = { id: string; workspace_id: string; name: string; query: View; created_at: string }

export const defaultView: View = { search: '', sort: { key: 'created_at', dir: 'desc' }, minScore: null }

export function useSavedViews(workspaceId: string) {
  const qc = useQueryClient()
  const views = useQuery({
    queryKey: ['saved_views', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase.from('saved_views').select('*').eq('workspace_id', workspaceId).order('created_at')
      if (error) throw error
      return data as SavedView[]
    },
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['saved_views', workspaceId] })
  return {
    ...views,
    async save(name: string, query: View) {
      const { error } = await supabase.from('saved_views').insert({ workspace_id: workspaceId, name, query })
      if (error) throw error
      refresh()
    },
    async remove(id: string) {
      const { error } = await supabase.from('saved_views').delete().eq('id', id)
      if (error) throw error
      refresh()
    },
  }
}
