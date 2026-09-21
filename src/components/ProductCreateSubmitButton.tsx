'use client'

import { useFormStatus } from 'react-dom'

export function ProductCreateSubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="primary-action min-w-[230px] disabled:cursor-wait disabled:opacity-60"
    >
      {pending ? 'Opslaan en concurrenten zoeken…' : 'Opslaan en concurrenten zoeken'}
    </button>
  )
}
