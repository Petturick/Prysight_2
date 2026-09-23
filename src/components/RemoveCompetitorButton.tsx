'use client'

export function RemoveCompetitorButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      onClick={(event) => {
        if (!window.confirm(`Concurrent ${label} bij dit product ontkoppelen? Andere producten en de concurrent zelf blijven behouden.`)) event.preventDefault()
      }}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d9e0e8] bg-white text-[18px] font-medium leading-none text-[#7b8999] transition hover:border-[#e1a8ae] hover:bg-[#fff4f5] hover:text-[#b6414d]"
      aria-label={`Ontkoppel ${label} van dit product`}
      title="Concurrent bij dit product ontkoppelen"
    >
      ×
    </button>
  )
}
