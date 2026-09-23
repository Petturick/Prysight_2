export function DatabaseNotice() {
  return (
    <div className="flex items-start gap-3 rounded-[10px] border border-[#f2ddb1] bg-[#fff8e9] px-4 py-3 text-[#7f5b1b] shadow-[0_2px_8px_rgba(31,49,77,.025)]">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff0c9] text-[12px] font-bold text-[#b4770e]">!</div>
      <div>
        <p className="text-[11px] font-semibold">Gegevens tijdelijk niet beschikbaar</p>
        <p className="mt-1 text-[10px] leading-5 text-[#8a6b31]">Het ophalen van gegevens is niet gelukt. Er zijn geen wijzigingen gedaan. Probeer de pagina opnieuw te laden.</p>
      </div>
    </div>
  )
}
