import { ReactNode } from 'react'

type Column<T> = {
  key: keyof T | string
  header: string
  className?: string
  render?: (row: T) => ReactNode
}

export function DataTable<T extends Record<string, ReactNode | string | number | null | undefined>>({ columns, rows, emptyText = 'Geen gegevens beschikbaar.' }: { columns: Array<Column<T>>; rows: T[]; emptyText?: string }) {
  return (
    <div className="overflow-hidden rounded-[18px] bg-white shadow-[0_12px_32px_rgba(31,42,68,0.09),0_2px_8px_rgba(31,42,68,0.05)] ring-1 ring-[#e0e4ee]">
      <div className="h-1 bg-gradient-to-r from-[#5964f4] via-[#6758ee] to-[#8b5cf6]" />
      <div className="overflow-x-auto">
        <table className="min-w-full text-[11px]">
          <thead className="bg-gradient-to-b from-[#f8f9fd] to-[#f2f4fa] text-left text-[#59667d]">
            <tr>
              {columns.map((column) => <th key={String(column.key)} className={`whitespace-nowrap px-4 py-4 text-[10px] font-extrabold uppercase tracking-[0.055em] ${column.className ?? ''}`}>{column.header}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-16 text-center text-[11px] font-medium text-[#8b95a7]">{emptyText}</td></tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="group align-top text-[#465168] transition-all duration-150 odd:bg-white even:bg-[#fbfcff] hover:bg-[#f3f4ff] hover:shadow-[inset_4px_0_0_#5964f4]">
                  {columns.map((column) => <td key={String(column.key)} className={`whitespace-nowrap border-t border-[#edf0f5] px-4 py-4 ${column.className ?? ''}`}>{column.render ? column.render(row) : row[column.key as keyof T]}</td>)}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
