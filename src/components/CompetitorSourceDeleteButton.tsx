'use client'

import { deleteCompetitorSourceAction } from '@/app/actions/competitorSourceActions'

export function CompetitorSourceDeleteButton({ competitorId, offerId, url }: { competitorId: string; offerId: string; url: string }) {
  return (
    <form action={deleteCompetitorSourceAction} onSubmit={(event) => {
      if (!window.confirm('Deze prijsbron definitief verwijderen? De gekoppelde productmatch, prijsmetingen en meldingen van alleen deze bron gaan verloren. De concurrent en andere prijsbronnen blijven behouden.')) event.preventDefault()
    }}>
      <input type="hidden" name="competitorId" value={competitorId} />
      <input type="hidden" name="offerId" value={offerId} />
      <input type="hidden" name="confirmedUrl" value={url} />
      <button type="submit" className="secondary-action border-[#e8c8cd] text-[#a33b4a] hover:bg-[#fff1f2]">Prijsbron verwijderen</button>
    </form>
  )
}
