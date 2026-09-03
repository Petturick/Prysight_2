import { ReactNode } from 'react'

const tones = {
  neutral: { bar: '#64748b', badge: '#e2e8f0', text: '#334155' },
  red: { bar: '#b4233d', badge: '#f6d7dd', text: '#8e1d32' },
  blue: { bar: 'var(--blue)', badge: 'var(--blue-soft)', text: '#1b43a6' },
  green: { bar: 'var(--green)', badge: 'var(--green-soft)', text: '#065f38' },
  violet: { bar: 'var(--violet)', badge: 'var(--violet-soft)', text: '#4320b8' },
  amber: { bar: 'var(--amber)', badge: 'var(--amber-soft)', text: '#7b4700' },
}

export function StatCard({ title, value, helper, accent, tone = 'neutral' }: { title: string; value: ReactNode; helper?: ReactNode; accent?: ReactNode; tone?: keyof typeof tones }) {
  const colors = tones[tone]

  return (
    <div className="relative overflow-hidden rounded-[15px] border-2 border-[var(--border)] bg-white shadow-[0_8px_20px_rgba(20,31,55,.10)]">
      <div className="h-1.5 w-full" style={{ background: colors.bar }} />
      <div className="p-4.5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-black uppercase tracking-[0.075em] text-[#4b5870]">{title}</p>
            <div className="mt-2 text-[30px] font-black tracking-[-0.04em] text-[#111827]">{value}</div>
          </div>
          {accent ? <div className="rounded-[9px] border px-2.5 py-1 text-[10px] font-extrabold" style={{ background: colors.badge, color: colors.text, borderColor: colors.bar }}>{accent}</div> : null}
        </div>
        {helper ? <div className="mt-3 border-t-2 border-[#d6dce7] pt-3 text-[11px] font-semibold leading-5 text-[#647087]">{helper}</div> : null}
      </div>
    </div>
  )
}
