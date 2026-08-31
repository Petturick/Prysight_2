'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="nl">
      <body style={{ margin: 0, fontFamily: 'Arial, sans-serif', background: '#f8fafc', color: '#171b28' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <section style={{ width: '100%', maxWidth: 520, border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: 32 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#667085' }}>PrySight</p>
            <h1 style={{ margin: '12px 0 8px', fontSize: 28 }}>Er ging iets mis</h1>
            <p style={{ margin: 0, lineHeight: 1.6, color: '#667085' }}>De applicatie kon deze pagina niet laden. Probeer het opnieuw.</p>
            <button
              type="button"
              onClick={reset}
              style={{ marginTop: 24, border: 0, borderRadius: 12, background: '#171b28', color: '#fff', padding: '12px 18px', fontWeight: 700, cursor: 'pointer' }}
            >
              Opnieuw proberen
            </button>
          </section>
        </main>
      </body>
    </html>
  )
}
