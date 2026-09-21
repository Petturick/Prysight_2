'use client'

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export type PriceChartSeries = {
  key: string
  name: string
  kind: 'own' | 'competitor'
  competitorId?: string
}

type PricePoint = Record<string, string | number | null>

const competitorColors = [
  '#2563eb',
  '#0f766e',
  '#7c3aed',
  '#c2410c',
  '#be123c',
  '#0369a1',
  '#4d7c0f',
  '#a21caf',
]

function euro(value: unknown) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(numeric)
}

export function PriceChart({ data, series, highlightedCompetitorId }: { data: PricePoint[]; series: PriceChartSeries[]; highlightedCompetitorId?: string | null }) {
  const hasData = (key: string) => data.some((point) => point[key] !== null && point[key] !== undefined)
  const ownSeries = series.find((item) => item.kind === 'own')
  const ownSeriesHasData = ownSeries ? hasData(ownSeries.key) : false
  const allCompetitorSeries = series.filter((item) => item.kind === 'competitor')
  const competitorSeries = allCompetitorSeries.filter((item) => hasData(item.key))
  const highlightedSeries = highlightedCompetitorId
    ? allCompetitorSeries.find((item) => item.competitorId === highlightedCompetitorId) ?? null
    : null

  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b border-[#e7edf3] px-5 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-[#0b1f35]">Prijsverloop</h2>
            <p className="mt-1 text-[11px] text-[#7d8b9a]">{highlightedSeries ? `Focus op ${highlightedSeries.name}, de overige lijnen blijven als context zichtbaar.` : 'Alle betrouwbare concurrentmetingen van de afgelopen 90 dagen.'}</p>
          </div>
          <div className="flex max-w-3xl flex-wrap gap-x-4 gap-y-2 text-[10px] font-medium text-[#5f7084]">
            {ownSeries ? (
              <span className={`inline-flex items-center gap-1.5 ${ownSeriesHasData ? '' : 'opacity-45'}`} title={ownSeriesHasData ? ownSeries.name : `${ownSeries.name}, nog geen historie`}>
                <span className="h-2.5 w-2.5 rounded-full bg-[#111827]" />
                {ownSeries.name}
              </span>
            ) : null}
            {allCompetitorSeries.map((item, index) => {
              const itemHasData = hasData(item.key)
              return (
                <span key={item.key} className={`inline-flex items-center gap-1.5 ${itemHasData ? '' : 'opacity-45'} ${highlightedSeries?.key === item.key ? 'font-semibold text-[#24384f]' : ''}`} title={itemHasData ? item.name : `${item.name}, nog geen geldige historische meting`}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: competitorColors[index % competitorColors.length] }} />
                  {item.name}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      <div className="h-80 w-full px-3 pb-3 pt-4 sm:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#dbe3ea' }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={62}
              tickFormatter={(value) => `€ ${Number(value).toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`}
            />
            <Tooltip
              cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }}
              contentStyle={{ borderRadius: 10, border: '1px solid #dce3ea', boxShadow: '0 8px 24px rgba(15,23,42,.10)', fontSize: 11 }}
              labelStyle={{ fontWeight: 700, color: '#26384d', marginBottom: 6 }}
              formatter={(value, name) => [euro(value), String(name)]}
            />
            {ownSeries && ownSeriesHasData ? (
              <Line
                type="monotone"
                dataKey={ownSeries.key}
                stroke="#111827"
                strokeWidth={2.4}
                name={ownSeries.name}
                connectNulls
                dot={{ r: 3, strokeWidth: 1.5, fill: '#ffffff' }}
                activeDot={{ r: 5 }}
              />
            ) : null}
            {competitorSeries.map((item) => {
              const fullIndex = allCompetitorSeries.findIndex((candidate) => candidate.key === item.key)
              const color = competitorColors[Math.max(fullIndex, 0) % competitorColors.length]
              const isFocused = !highlightedSeries || highlightedSeries.key === item.key
              return (
                <Line
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  stroke={color}
                  strokeWidth={highlightedSeries && isFocused ? 3 : 2}
                  strokeOpacity={highlightedSeries && !isFocused ? 0.22 : 1}
                  name={item.name}
                  connectNulls
                  dot={{ r: highlightedSeries && isFocused ? 5 : 3.5, strokeWidth: 2, fill: '#ffffff' }}
                  activeDot={{ r: highlightedSeries && isFocused ? 7 : 6 }}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
