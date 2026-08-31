'use client'

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export function PriceChart({ data }: { data: Array<{ date: string; ownPrice?: number | null; competitorPrice?: number | null }> }) {
  return (
    <div className="h-80 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(value ?? 0))} />
          <Line type="monotone" dataKey="ownPrice" stroke="#0f172a" strokeWidth={2} name="Eigen prijs" dot={false} />
          <Line type="monotone" dataKey="competitorPrice" stroke="#0ea5e9" strokeWidth={2} name="Concurrentie" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
