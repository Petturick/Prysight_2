'use client'

import { useState } from 'react'

type Segment = {
  label: string
  count: number
  color: string
}

const RADIUS = 66
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export default function MarketPositionDonut({
  total,
  lowerOrEqual,
  higher,
  withoutComparison,
}: {
  total: number
  lowerOrEqual: number
  higher: number
  withoutComparison: number
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const segments: Segment[] = [
    { label: 'Onder of gelijk aan markt', count: lowerOrEqual, color: '#299574' },
    { label: 'Boven markt', count: higher, color: '#c95c61' },
    { label: 'Geen actuele vergelijking', count: withoutComparison, color: '#e7b05b' },
  ]
  const percentage = (count: number) => total ? Math.round(count / total * 100) : 0
  const active = activeIndex === null ? null : segments[activeIndex]
  let elapsed = 0

  return (
    <div className="mt-6 flex flex-col items-center">
      <div className="relative h-40 w-40">
        <svg
          viewBox="0 0 160 160"
          className="h-40 w-40"
          role="group"
          aria-label="Concurrentiepositie, beweeg over of selecteer een kleur voor het aantal en percentage"
        >
          <circle cx="80" cy="80" r={RADIUS} fill="none" stroke="#e8edf3" strokeWidth="28" />
          {segments.map((segment, index) => {
            const start = elapsed
            elapsed += segment.count
            if (segment.count <= 0 || total <= 0) return null
            const label = `${segment.label}: ${segment.count} van ${total} producten, ${percentage(segment.count)}%`
            return (
              <circle
                key={segment.label}
                cx="80"
                cy="80"
                r={RADIUS}
                fill="none"
                stroke={segment.color}
                strokeWidth="28"
                strokeDasharray={`${CIRCUMFERENCE * segment.count / total} ${CIRCUMFERENCE}`}
                strokeDashoffset={-CIRCUMFERENCE * start / total}
                transform="rotate(-90 80 80)"
                className="cursor-pointer outline-none focus-visible:stroke-[32px]"
                role="button"
                tabIndex={0}
                aria-label={label}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
                onClick={() => setActiveIndex(index)}
              >
                <title>{label}</title>
              </circle>
            )
          })}
        </svg>
        <div className="pointer-events-none absolute inset-[27px] flex flex-col items-center justify-center rounded-full bg-white px-1 text-center" aria-live="polite">
          {active ? (
            <>
              <strong className="text-[21px] leading-none text-[#172033]">{active.count}</strong>
              <span className="mt-1 text-[9px] font-medium leading-[11px] text-[#59677b]">{active.label}</span>
              <span className="mt-1 text-[10px] font-semibold text-[#172033]">{percentage(active.count)}%</span>
            </>
          ) : (
            <>
              <strong className="text-[25px] text-[#172033]">{total}</strong>
              <span className="text-[10px] text-[#8996a8]">producten</span>
            </>
          )}
        </div>
      </div>
      <div className="sr-only">Gebruik Tab om de gekleurde delen te selecteren en hun betekenis te lezen.</div>
    </div>
  )
}
