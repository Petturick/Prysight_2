export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import writeXlsxFile from 'write-excel-file/node'
import { ReportStatus } from '@/generated/prisma/client'
import { buildWeeklyReportPayload } from '@/app/actions/reportActions'
import { verifyBearerSecret } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

function toCsv(data: unknown) { const serialized = JSON.stringify(data, null, 2); return `sectie,waarde\ncontent,"${serialized.replaceAll('"', '""')}"\n` }
function flattenReportRows(content: unknown): (string | number | boolean | Date | null)[][] {
  const rows: (string | number | boolean | Date | null)[][] = [['sectie', 'waarde']]
  if (Array.isArray(content)) { content.forEach((item, index) => rows.push([`rij-${index + 1}`, JSON.stringify(item)])); return rows }
  if (content && typeof content === 'object') { Object.entries(content as Record<string, unknown>).forEach(([key, value]) => rows.push([key, JSON.stringify(value)])); return rows }
  rows.push(['content', JSON.stringify(content)]); return rows
}
async function buildXlsxBuffer(content: unknown) { const buffer = await writeXlsxFile(flattenReportRows(content)).toBuffer(); return new Uint8Array(buffer) }

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const format = searchParams.get('format'); const id = searchParams.get('id')
  if (format && id) {
    const report = await prisma.report.findUnique({ where: { id } })
    if (!report) return NextResponse.json({ error: 'Rapport niet gevonden' }, { status: 404 })
    if (format === 'csv') return new NextResponse(toCsv(report.content), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="rapport-${report.id}.csv"` } })
    const buffer = await buildXlsxBuffer(report.content)
    return new NextResponse(buffer, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="rapport-${report.id}.xlsx"` } })
  }
  return NextResponse.json(await prisma.report.findMany({ orderBy: { createdAt: 'desc' } }))
}

export async function POST(request: Request) {
  const access = verifyBearerSecret(request, 'REPORT_API_KEY')
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status })
  const today = new Date(); const day = today.getDay() || 7
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - day + 1); weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999)
  const report = await prisma.report.create({ data: { title: `Weekrapport ${weekStart.toLocaleDateString('nl-NL')}`, weekStart, weekEnd, status: ReportStatus.GENERATED, content: (await buildWeeklyReportPayload()) as never, generatedAt: new Date() } })
  const webhookUrl = process.env.REPORT_WEBHOOK_URL
  if (webhookUrl) fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: report.id, title: report.title, weekStart, weekEnd, generatedAt: report.generatedAt }) }).catch((error) => console.error('Report webhook failed', error))
  return NextResponse.json(report, { status: 201 })
}
