'use client'

import { useFormStatus } from 'react-dom'

export function PriceFetchSubmitButton({
  idleLabel,
  pendingLabel = 'Prijzen ophalen…',
  disabled = false,
  compact = false,
}: {
  idleLabel: string
  pendingLabel?: string
  disabled?: boolean
  compact?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending}
      className={compact
        ? 'secondary-action min-h-[32px] px-2.5 py-1.5 text-[9px] disabled:cursor-wait disabled:opacity-50'
        : 'primary-action disabled:cursor-wait disabled:opacity-50'}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 11a8 8 0 0 0-14.8-4.2L3 9m0 0V4m0 5h5M4 13a8 8 0 0 0 14.8 4.2L21 15m0 0v5m0-5h-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {pending ? pendingLabel : idleLabel}
    </button>
  )
}
