'use client'

import { useEffect, useState } from 'react'

export function ProductSelectionControls({ formId }: { formId: string }) {
  const [selected, setSelected] = useState(0)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const form = document.getElementById(formId)
    if (!form) return

    const sync = () => {
      const boxes = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="productIds"]'))
      setTotal(boxes.length)
      setSelected(boxes.filter((box) => box.checked).length)
    }

    sync()
    form.addEventListener('change', sync)
    return () => form.removeEventListener('change', sync)
  }, [formId])

  const setAll = (checked: boolean) => {
    const form = document.getElementById(formId)
    if (!form) return
    const boxes = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="productIds"]'))
    boxes.forEach((box) => { box.checked = checked })
    setSelected(checked ? boxes.length : 0)
    setTotal(boxes.length)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-[#eef3f8] px-3 py-2 text-[10px] font-black text-[#506276]">{selected} geselecteerd</span>
      <button type="button" onClick={() => setAll(true)} disabled={total === 0 || selected === total} className="secondary-action min-h-0 px-3 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-45">Selecteer pagina</button>
      <button type="button" onClick={() => setAll(false)} disabled={selected === 0} className="secondary-action min-h-0 px-3 py-2 text-[10px] disabled:cursor-not-allowed disabled:opacity-45">Deselecteer</button>
    </div>
  )
}
