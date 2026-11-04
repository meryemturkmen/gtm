import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/companies')({
  component: () => (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Companies</h1>
      <p className="text-label-2 mt-1">The enrichment table lands in Phase 1.</p>
    </div>
  ),
})
