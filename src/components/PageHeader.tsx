/** One header for every page: title, a quiet line of context, and the page's actions on the right. */
export function PageHeader({ title, meta, children }: { title: React.ReactNode; meta?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-3 px-6 h-14 shrink-0 bg-bg sticky top-0 z-10">
      <h1 className="title truncate">{title}</h1>
      {meta && <span className="text-label-2 truncate">{meta}</span>}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </header>
  )
}
