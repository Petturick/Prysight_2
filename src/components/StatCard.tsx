import { ReactNode } from 'react'

const tones = {
  neutral: { dot: '#8b95a7', soft: '#f4f6f8' },
  red: { dot: 'var(--accent)', soft: 'var(--accent-soft)' },
  blue: { dot: 'var(--blue)', soft: 'var(--blue-soft)' },
  green: { dot: 'var(--green)', soft: 'var(--green-soft)' },
  violet: { dot: 'var(--violet)', soft: 'var(--violet-soft)' },
  amber: { dot: 'var(--amber)', soft: 'var(--amber-soft)' },
}

export function StatCard({ title, value, helper, accent, tone = 'neutral' }: { title: string; value: ReactNode; helper?: ReactNode; accent?: ReactNode; tone?: keyof typeof tones }) {
  const colors = tones[tone]

  return (
    <div className="surface-card-flat p-4.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: colors.dot }} />
            <p className="truncate text-[12px] font-medium text-[#697386]">{title}</p>
          </div>
          <div className="mt-2.5 text-[28px] font-semibold tracking-[-0.03em] text-[#161a26]">{value}</div>
        </div>
        {accent ? <div className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-[#566071]" style={{ background: colors.soft }}>{accent}</div> : null}
      </div>
      {helper ? <div className="mt-3 border-t border-[var(--border)] pt-3 text-[11px] leading-5 text-[#8790a2]">{helper}</div> : null}
    </div>
  )
}
