'use client'

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

type Slice = { name: string; value: number; color: string }

function Donut({ title, subtitle, data, centerLabel, centerValue }: { title: string; subtitle: string; data: Slice[]; centerLabel: string; centerValue: string }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const chartData = total > 0 ? data : [{ name: 'Geen data', value: 1, color: '#eef0f4' }]

  return (
    <div className="surface-card p-5">
      <div>
        <h2 className="text-[14px] font-semibold text-[#252a37]">{title}</h2>
        <p className="mt-1 text-[11px] text-[#8a93a5]">{subtitle}</p>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-[170px_1fr] sm:items-center">
        <div className="relative h-[170px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={76} paddingAngle={total > 0 ? 2 : 0} stroke="none">
                {chartData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(value) => [String(value), 'Aantal']} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <strong className="text-xl font-semibold text-[#202536]">{centerValue}</strong>
            <span className="mt-0.5 text-[10px] font-medium text-[#8a93a5]">{centerLabel}</span>
          </div>
        </div>
        <div className="space-y-2.5">
          {data.map((item) => {
            const pct = total > 0 ? Math.round((item.value / total) * 100) : 0
            return (
              <div key={item.name} className="flex items-center justify-between gap-3 text-[11px]">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
                  <span className="truncate text-[#596273]">{item.name}</span>
                </div>
                <span className="shrink-0 font-semibold text-[#2b3140]">{item.value} · {pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function DashboardOverviewCharts({ market, monitoring }: { market: { lower: number; equal: number; higher: number; noPrice: number }; monitoring: { healthy: number; stale: number; failed: number } }) {
  const marketTotal = market.lower + market.equal + market.higher
  const monitoringTotal = monitoring.healthy + monitoring.stale + monitoring.failed

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Donut
        title="Concurrentiepositie"
        subtitle="Alleen producten met geverifieerde prijsmetingen."
        centerLabel="vergelijkbaar"
        centerValue={String(marketTotal)}
        data={[
          { name: 'Engels goedkoper', value: market.lower, color: 'var(--green)' },
          { name: 'Gelijk aan markt', value: market.equal, color: 'var(--blue)' },
          { name: 'Engels duurder', value: market.higher, color: 'var(--accent)' },
          { name: 'Nog geen prijs', value: market.noPrice, color: '#d9dde5' },
        ]}
      />
      <Donut
        title="Monitoringstatus"
        subtitle="Gezondheid van de actuele prijsmetingen."
        centerLabel="metingen"
        centerValue={String(monitoringTotal)}
        data={[
          { name: 'Actueel', value: monitoring.healthy, color: 'var(--green)' },
          { name: 'Verouderd', value: monitoring.stale, color: '#e4a11b' },
          { name: 'Mislukt', value: monitoring.failed, color: 'var(--accent)' },
        ]}
      />
    </div>
  )
}
