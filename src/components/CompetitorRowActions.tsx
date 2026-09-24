'use client'

import { useState } from 'react'
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
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmationName, setConfirmationName] = useState('')
  const deleteReady = confirmationName === name

  return (
    <>
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
            <button type="button" onClick={() => { setConfirmationName(''); setConfirmingDelete(true) }}
              className="ps-button-danger min-h-[34px] min-w-[34px] px-2 text-[16px]" aria-label={`Verwijder concurrent ${name} volledig`} title="Concurrent definitief verwijderen">×</button>
          </>
        ) : null}
      </div>

      {confirmingDelete ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#111c2d]/55 p-4" role="presentation">
          <form action={deleteCompetitorAdminAction} role="dialog" aria-modal="true" aria-labelledby={`delete-competitor-${id}`} className="w-full max-w-md rounded-[14px] border border-[#e2e8f0] bg-white p-6 shadow-[0_24px_70px_rgba(15,29,48,.22)]">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="expectedOffers" value={offerCount} />
            <p className="text-[10px] font-semibold text-[#b84a50]">Definitief verwijderen</p>
            <h2 id={`delete-competitor-${id}`} className="mt-1 text-[18px] font-semibold text-[#25364b]">{name}</h2>
            <p className="mt-3 text-[12px] leading-6 text-[#66768b]">
              Hiermee verwijder je deze concurrent, {offerCount} prijsbron{offerCount === 1 ? '' : 'nen'}, productkoppelingen en bijbehorende prijshistorie. Dit kan niet ongedaan worden gemaakt.
            </p>
            <label className="mt-4 block text-[11px] font-semibold text-[#536278]">
              Typ de volledige concurrentnaam om te bevestigen
              <input name="confirmationName" value={confirmationName} onChange={event => setConfirmationName(event.target.value)}
                autoComplete="off" autoFocus className="mt-2 w-full" />
            </label>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="secondary-action" onClick={() => { setConfirmingDelete(false); setConfirmationName('') }}>Annuleren</button>
              <button type="submit" disabled={!deleteReady} className="ps-button-danger px-4 py-2 disabled:cursor-not-allowed disabled:opacity-40">Concurrent verwijderen</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  )
}
