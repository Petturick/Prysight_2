'use client'

import { useEffect, useRef, useState } from 'react'
import { productGroupLabel, suggestProductGroup } from '@/lib/product-groups'

type Group = { name: string; description: string | null }

export function ProductGroupField({ formId, groups }: { formId: string; groups: Group[] }) {
  const selectRef = useRef<HTMLSelectElement>(null)
  const suggestedRef = useRef('')
  const [suggestion, setSuggestion] = useState('')

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    const nameField = form?.elements.namedItem('name') as HTMLInputElement | null
    const select = selectRef.current
    if (!nameField || !select) return

    const updateSuggestion = () => {
      const existing = select.value
      // A category deliberately selected by the user must not be overwritten.
      if (existing && existing !== suggestedRef.current) return
      const next = suggestProductGroup(nameField.value, groups) ?? ''
      select.value = next
      suggestedRef.current = next
      setSuggestion(next ? productGroupLabel(groups.find((group) => group.name === next)!) : '')
    }
    nameField.addEventListener('input', updateSuggestion)
    nameField.addEventListener('change', updateSuggestion)
    updateSuggestion()
    return () => {
      nameField.removeEventListener('input', updateSuggestion)
      nameField.removeEventListener('change', updateSuggestion)
    }
  }, [formId, groups])

  const available = groups.filter((group) => productGroupLabel(group) !== 'Nog niet ingedeeld')

  return (
    <div className="sm:col-span-2">
      <label htmlFor="product-group" className="text-[11px] font-semibold text-[#4f5869]">
        Productgroep <span className="font-normal text-[#738298]">(optioneel)</span>
      </label>
      <select id="product-group" name="productGroup" ref={selectRef}
        onChange={() => { suggestedRef.current = ''; setSuggestion('') }}
        className="toolbar-control mt-1.5 w-full" defaultValue="">
        <option value="">Geen productgroep geselecteerd</option>
        {available.map((group) => <option key={group.name} value={group.name}>{productGroupLabel(group)}</option>)}
      </select>
      <p className="mt-1 text-[11px] font-normal text-[#748296]" role="status">
        {suggestion ? `Voorgesteld op basis van de productnaam: ${suggestion}. Je kunt dit aanpassen.` : 'Niet nodig om prijzen of concurrenten te vergelijken. Productgroepen beheer je onder Beheer.'}
      </p>
    </div>
  )
}
