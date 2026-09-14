import { ReactNode } from 'react'

type Column<T> = { key: keyof T | string; header: string; className?: string; render?: (row: T) => ReactNode }

export function DataTable<T extends Record<string, ReactNode | string | number | null | undefined>>({ columns, rows, emptyText = 'Geen gegevens beschikbaar.' }: { columns: Array<Column<T>>; rows: T[]; emptyText?: string }) {
  return <div className="overflow-hidden rounded-[16px] bg-white shadow-[0_10px_28px_rgba(31,48,70,.08)]">
    <div className="overflow-x-auto">
      <table className="min-w-full border-0 text-[12px] shadow-none">
        <thead className="bg-[#edf3f8] text-left text-[#586b81]">
          <tr>{columns.map((column) => <th key={String(column.key)} className={`whitespace-nowrap border-0 px-4 py-3 text-[10px] font-bold ${column.className ?? ''}`}>{column.header}</th>)}</tr>
        </thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={columns.length} className="px-4 py-16 text-center text-[12px] font-semibold text-[#7b8999]">{emptyText}</td></tr> : rows.map((row, index) => <tr key={index} className="align-top text-[#405268] transition-colors hover:bg-[#f7fbff]">{columns.map((column) => <td key={String(column.key)} className={`whitespace-nowrap border-t border-[#edf1f5] px-4 py-3.5 ${column.className ?? ''}`}>{column.render ? column.render(row) : row[column.key as keyof T]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </div>
}
