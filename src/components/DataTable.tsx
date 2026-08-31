import { ReactNode } from 'react'

type Column<T> = {
  key: keyof T | string
  header: string
  className?: string
  render?: (row: T) => ReactNode
}

export function DataTable<T extends Record<string, ReactNode | string | number | null | undefined>>({ columns, rows, emptyText = 'Geen gegevens beschikbaar.' }: { columns: Array<Column<T>>; rows: T[]; emptyText?: string }) {
  return (
    <div className="overflow-hidden rounded-[14px] bg-white shadow-[0_2px_10px_rgba(20,29,48,0.055)] ring-1 ring-[#dce1e9]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-[11px]">
          <thead className="bg-[#f2f4f8] text-left text-[#677186]">
            <tr>
              {columns.map((column) => <th key={String(column.key)} className={`whitespace-nowrap px-4 py-3.5 text-[10px] font-bold uppercase tracking-[0.045em] ${column.className ?? ''}`}>{column.header}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-12 text-center text-[11px] text-[#8b95a7]">{emptyText}</td></tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="align-top text-[#4b5364] transition-colors odd:bg-white even:bg-[#fbfcfe] hover:bg-[#f5f7fb]">
                  {columns.map((column) => <td key={String(column.key)} className={`whitespace-nowrap px-4 py-3.5 ${column.className ?? ''}`}>{column.render ? column.render(row) : row[column.key as keyof T]}</td>)}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
