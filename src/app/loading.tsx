export default function Loading() {
  return (
    <div className="space-y-4" aria-live="polite" aria-busy="true">
      <section className="strong-panel p-5 sm:p-6">
        <div className="h-3 w-24 animate-pulse rounded bg-[#e3e8ee]" />
        <div className="mt-3 h-8 w-[min(520px,80%)] animate-pulse rounded bg-[#dbe2e9]" />
        <div className="mt-3 h-3 w-[min(680px,92%)] animate-pulse rounded bg-[#edf1f5]" />
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-[12px] border border-[#dfe5eb] bg-white shadow-[0_2px_8px_rgba(16,28,44,.04)]" />
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <div className="h-72 animate-pulse rounded-[12px] border border-[#dfe5eb] bg-white" />
        <div className="h-72 animate-pulse rounded-[12px] border border-[#dfe5eb] bg-white" />
      </section>
    </div>
  )
}
