import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/settings')({
  component: () => (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      <p className="text-label-2 mt-1">Columns, ICP and API keys land in Phase 1 and 4.</p>
    </div>
  ),
})
