import { ReactNode } from 'react'

type Column<T> = { key: keyof T | string; header: string; className?: string; render?: (row: T) => ReactNode }

export function DataTable<T extends Record<string, ReactNode | string | number | null | undefined>>({ columns, rows, emptyText = 'Geen gegevens beschikbaar.' }: { columns: Array<Column<T>>; rows: T[]; emptyText?: string }) {
  return <div className="overflow-hidden rounded-[9px] border border-[#e2e7ee] bg-white shadow-[0_2px_8px_rgba(31,49,77,.035)]">
    <div className="overflow-x-auto">
      <table className="min-w-full border-0 text-[12px]">
        <thead className="bg-[#f6f8fb] text-left text-[#526278]"><tr>{columns.map((column) => <th key={String(column.key)} className={`whitespace-nowrap border-b border-[#e3e8ef] px-4 py-3 text-[10px] font-semibold ${column.className ?? ''}`}>{column.header}</th>)}</tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={columns.length} className="px-4 py-14 text-center text-[12px] font-medium text-[#7b889a]">{emptyText}</td></tr> : rows.map((row, index) => <tr key={index} className="align-top text-[#34445b] transition-colors hover:bg-[#f8fbff]">{columns.map((column) => <td key={String(column.key)} className={`whitespace-nowrap border-t border-[#edf0f4] px-4 py-3.5 ${column.className ?? ''}`}>{column.render ? column.render(row) : row[column.key as keyof T]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </div>
}
