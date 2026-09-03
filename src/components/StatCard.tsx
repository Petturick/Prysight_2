import { ReactNode } from 'react'

const tones = {
  neutral: { bar: '#8a98aa', badge: '#f1f4f8', text: '#4f6077' },
  red: { bar: '#ee6769', badge: '#fff0f0', text: '#c64f52' },
  blue: { bar: '#4f86e8', badge: '#edf4ff', text: '#3d73d4' },
  green: { bar: '#29a56f', badge: '#ecf8f2', text: '#21835d' },
  violet: { bar: '#4f86e8', badge: '#edf4ff', text: '#3d73d4' },
  amber: { bar: '#f2a51a', badge: '#fff6e4', text: '#a96a08' },
}

export function StatCard({ title, value, helper, accent, tone = 'neutral' }: { title: string; value: ReactNode; helper?: ReactNode; accent?: ReactNode; tone?: keyof typeof tones }) {
  const colors = tones[tone]
  return <div className="relative overflow-hidden rounded-[10px] border border-[#e2e7ee] bg-white shadow-[0_2px_8px_rgba(31,49,77,.04)]">
    <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: colors.bar }} />
    <div className="p-4 pl-5">
      <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate text-[10px] font-semibold text-[#526278]">{title}</p><div className="mt-1.5 text-[28px] font-bold tracking-[-0.035em] text-[#17233a]">{value}</div></div>{accent ? <div className="rounded-[7px] border px-2 py-1 text-[9px] font-semibold" style={{ background: colors.badge, color: colors.text, borderColor: `${colors.bar}35` }}>{accent}</div> : null}</div>
      {helper ? <div className="mt-2.5 text-[10px] font-medium leading-5 text-[#7b889a]">{helper}</div> : null}
    </div>
  </div>
}
