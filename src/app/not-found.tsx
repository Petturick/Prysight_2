import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl">
      <section className="ps-panel p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#edf4ff] text-[16px] font-semibold text-[#3d73d4]">404</div>
          <div className="min-w-0">
            <p className="eyebrow">Pagina niet gevonden</p>
            <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.025em] text-[#17233a]">Deze pagina bestaat niet meer</h1>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#66768b]">
              De link kan verouderd zijn of het onderdeel is verplaatst. Je gegevens zijn niet gewijzigd.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/dashboard" className="primary-action">Naar overzicht</Link>
              <Link href="/producten" className="secondary-action">Naar producten</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
