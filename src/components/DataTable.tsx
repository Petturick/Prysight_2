import { ReactNode } from 'react'

type Column<T> = { key: keyof T | string; header: string; className?: string; render?: (row: T) => ReactNode }

export function DataTable<T extends Record<string, ReactNode | string | number | null | undefined>>({ columns, rows, emptyText = 'Geen gegevens beschikbaar.' }: { columns: Array<Column<T>>; rows: T[]; emptyText?: string }) {
  return <div className="overflow-hidden rounded-[16px] bg-white shadow-[0_8px_24px_rgba(27,43,65,.055)]">
    <div className="overflow-x-auto">
      <table className="min-w-full border-0 text-[12px] shadow-none">
        <thead className="bg-[#f5f7fa] text-left text-[#607187]">
          <tr>{columns.map((column) => <th key={String(column.key)} className={`whitespace-nowrap border-0 px-4 py-3.5 text-[11px] font-bold ${column.className ?? ''}`}>{column.header}</th>)}</tr>
        </thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={columns.length} className="px-5 py-14 text-center text-[12px] font-semibold text-[#7d8b9c]">{emptyText}</td></tr> : rows.map((row, index) => <tr key={index} className="align-middle text-[#405268] transition-colors odd:bg-white even:bg-[#fbfcfe] hover:bg-[#f6faff]">{columns.map((column) => <td key={String(column.key)} className={`whitespace-nowrap border-t border-[#eef2f6] px-4 py-4 ${column.className ?? ''}`}>{column.render ? column.render(row) : row[column.key as keyof T]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </div>
}
