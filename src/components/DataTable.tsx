import { ReactNode } from 'react'

type Column<T> = {
  key: keyof T | string
  header: string
  className?: string
  render?: (row: T) => ReactNode
}

export function DataTable<T extends Record<string, ReactNode | string | number | null | undefined>>({ columns, rows, emptyText = 'Geen gegevens beschikbaar.' }: { columns: Array<Column<T>>; rows: T[]; emptyText?: string }) {
  return (
    <div className="overflow-hidden rounded-[16px] border-2 border-[#aeb8c9] bg-white shadow-[0_12px_28px_rgba(20,31,55,.11)]">
      <div className="h-1.5 bg-[linear-gradient(90deg,#5b2be8_0%,#3e43d8_50%,#2457d6_100%)]" />
      <div className="overflow-x-auto">
        <table className="min-w-full border-0 text-[12px]">
          <thead className="bg-[#dfe4ee] text-left text-[#253149]">
            <tr>
              {columns.map((column) => <th key={String(column.key)} className={`whitespace-nowrap border-b-2 border-[#aeb8c9] px-4 py-3.5 text-[10px] font-black uppercase tracking-[0.065em] ${column.className ?? ''}`}>{column.header}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-16 text-center text-[12px] font-semibold text-[#6f7b91]">{emptyText}</td></tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="group align-top font-medium text-[#2c374d] transition-all duration-150 odd:bg-white even:bg-[#f3f5f9] hover:bg-[#e9e3ff] hover:shadow-[inset_5px_0_0_#5b2be8]">
                  {columns.map((column) => <td key={String(column.key)} className={`whitespace-nowrap border-t border-[#cbd2df] px-4 py-4 ${column.className ?? ''}`}>{column.render ? column.render(row) : row[column.key as keyof T]}</td>)}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
