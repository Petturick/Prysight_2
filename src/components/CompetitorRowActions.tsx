'use client'

import Link from 'next/link'
import { deleteCompetitorAdminAction, setCompetitorActiveAction } from '@/app/actions/adminActions'

type Props = {
  id: string
  name: string
  isActive: boolean
  offerCount: number
  canWrite: boolean
}

export function CompetitorRowActions({ id, name, isActive, offerCount, canWrite }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link href={`/concurrenten/${id}`} className="secondary-action min-h-0 px-3 py-2 text-[11px]">Bekijken</Link>
      {canWrite ? (
        <>
          <Link href={`/concurrenten/${id}/bewerken`} className="secondary-action min-h-0 px-3 py-2 text-[11px]" aria-label={`Wijzig ${name}`}>Wijzigen</Link>
          <form action={setCompetitorActiveAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="isActive" value={String(!isActive)} />
            <button type="submit" className="secondary-action min-h-0 px-3 py-2 text-[11px]" aria-label={isActive ? `Pauzeer ${name}` : `Activeer ${name}`}>
              {isActive ? 'Pauzeren' : 'Activeren'}
            </button>
          </form>
          <form action={deleteCompetitorAdminAction} onSubmit={(event) => {
            const answer = window.prompt(`Concurrent "${name}" definitief verwijderen? Dit verwijdert ook ${offerCount} prijsbronnen, hun productkoppelingen en prijshistorie. Typ de volledige concurrentnaam om te bevestigen:`)
            if (answer !== name) event.preventDefault()
          }}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="confirmationName" value={name} />
            <input type="hidden" name="expectedOffers" value={offerCount} />
            <button type="submit" className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-[#e8c8cd] bg-white text-[19px] text-[#a33b4a] transition hover:bg-[#fff1f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a33b4a]" aria-label={`Verwijder concurrent ${name} volledig`} title="Concurrent definitief verwijderen">×</button>
          </form>
        </>
      ) : null}
    </div>
  )
}
