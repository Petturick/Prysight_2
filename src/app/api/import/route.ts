export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseImportFile } from '@/lib/import-parser'

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_EXTENSIONS = ['.csv', '.xlsx']
const MAX_ROWS = 50_000

export async function GET() {
  const tasks = await prisma.importTask.findMany({ include: { user: true }, orderBy: { createdAt: 'desc' }, take: 25 })
  return NextResponse.json(tasks)
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Bestand ontbreekt.' }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: `Bestand is te groot. Maximale bestandsgrootte is 10 MB.` }, { status: 413 })
    }

    // Validate file extension
    const filename = file.name.toLowerCase()
    const hasValidExtension = ALLOWED_EXTENSIONS.some((ext) => filename.endsWith(ext))
    if (!hasValidExtension) {
      return NextResponse.json({ error: 'Ongeldig bestandstype. Alleen CSV en XLSX bestanden worden ondersteund.' }, { status: 400 })
    }

    try {
      const parsed = await parseImportFile(file.name, await file.arrayBuffer())

      // Limit number of rows to prevent memory exhaustion
      if (parsed.rows.length > MAX_ROWS) {
        return NextResponse.json({ error: `Bestand bevat te veel rijen (${parsed.rows.length}). Maximum is ${MAX_ROWS}.` }, { status: 400 })
      }

      return NextResponse.json({ headers: parsed.headers, preview: parsed.rows.slice(0, 10), rows: parsed.rows, format: parsed.format })
    } catch {
      return NextResponse.json({ error: 'Bestand kon niet veilig worden verwerkt.' }, { status: 400 })
    }
  }

  const body = await request.json()
  return NextResponse.json({ message: 'Gebruik de importwizard of upload een bestand via multipart/form-data.', received: body }, { status: 202 })
}
