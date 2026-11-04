import { useEffect } from 'react'

/** Side sheet (HIG: sheets for focused tasks). Escape closes, focus moves inside. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-20 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="flex-1 bg-black/20 cursor-default" onClick={onClose} />
      <section className="w-[420px] max-w-full h-full bg-surface border-l border-separator shadow-2xl flex flex-col">
        <header className="flex items-center justify-between px-4 h-11 border-b border-separator">
          <h2 className="font-semibold truncate">{title}</h2>
          <button className="btn" onClick={onClose} autoFocus>Done</button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">{children}</div>
      </section>
    </div>
  )
}
