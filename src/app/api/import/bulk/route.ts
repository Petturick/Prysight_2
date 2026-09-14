export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { recognizeBulkProductFeed } from '@/lib/bulk-product-import'
import { parseImportFile } from '@/lib/import-parser'

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_ROWS = 50_000

export async function POST(request: Request) {
  try {
    await requirePermission('imports.run')
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Bestand ontbreekt.' }, { status: 400 })
    if (file.size > MAX_FILE_SIZE_BYTES) return NextResponse.json({ error: 'Bestand is te groot. Maximum is 10 MB.' }, { status: 413 })
    if (!/\.(csv|xlsx)$/i.test(file.name)) return NextResponse.json({ error: 'Alleen CSV en XLSX worden ondersteund.' }, { status: 400 })

    const parsed = await parseImportFile(file.name, await file.arrayBuffer())
    if (parsed.rows.length > MAX_ROWS) return NextResponse.json({ error: `Bestand bevat ${parsed.rows.length} regels, maximum is ${MAX_ROWS}.` }, { status: 400 })
    const recognition = recognizeBulkProductFeed(parsed)
    if (!recognition.rows.length) return NextResponse.json({ error: 'Geen importeerbare productregels gevonden.' }, { status: 400 })

    return NextResponse.json({
      filename: file.name,
      format: parsed.format,
      profile: recognition.profile,
      productCount: recognition.rows.length,
      detectedCompetitors: recognition.detectedCompetitors,
      recognizedFields: recognition.recognizedFields,
      ignoredFields: recognition.ignoredFields,
      preview: recognition.rows.slice(0, 8),
      rows: recognition.rows,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Bestand kon niet automatisch worden herkend.' }, { status: 400 })
  }
}
