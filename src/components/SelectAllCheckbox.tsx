'use client'

import { useEffect, useRef } from 'react'

export function SelectAllCheckbox({ targetName, label = 'Alles selecteren' }: { targetName: string; label?: string }) {
  const masterRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const master = masterRef.current
    const form = master?.closest('form')
    if (!master || !form) return

    const items = () => Array.from(form.querySelectorAll<HTMLInputElement>(`input[name="${targetName}"]`))
    const sync = () => {
      const checkboxes = items()
      const checked = checkboxes.filter((item) => item.checked).length
      master.checked = checkboxes.length > 0 && checked === checkboxes.length
      master.indeterminate = checked > 0 && checked < checkboxes.length
    }

    const handleChange = (event: Event) => {
      const target = event.target as HTMLInputElement | null
      if (target?.name === targetName) sync()
    }

    form.addEventListener('change', handleChange)
    sync()
    return () => form.removeEventListener('change', handleChange)
  }, [targetName])

  return (
    <label className="inline-flex cursor-pointer items-center gap-2" title={label}>
      <input
        ref={masterRef}
        type="checkbox"
        aria-label={label}
        onChange={(event) => {
          const form = event.currentTarget.closest('form')
          if (!form) return
          form.querySelectorAll<HTMLInputElement>(`input[name="${targetName}"]`).forEach((item) => {
            item.checked = event.currentTarget.checked
          })
        }}
        className="h-4 w-4 cursor-pointer accent-[var(--blue)]"
      />
      <span className="text-[10px] font-black text-[#526278]">Alles</span>
    </label>
  )
}
