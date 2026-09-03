'use client'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="nl">
      <body style={{ margin: 0, fontFamily: 'Inter, Arial, sans-serif', background: '#f7f9fc', color: '#17233a' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <section style={{ width: '100%', maxWidth: 560, border: '1px solid #e2e7ee', borderRadius: 10, background: '#fff', padding: 32, boxShadow: '0 16px 42px rgba(31,49,77,.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 9, display: 'grid', placeItems: 'center', background: '#fff0f0', color: '#ee6769', fontWeight: 800 }}>!</div>
              <div>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#718096' }}>Prysight</p>
                <h1 style={{ margin: '5px 0 0', fontSize: 26, letterSpacing: '-0.025em' }}>Er ging iets mis</h1>
              </div>
            </div>
            <p style={{ margin: '18px 0 0', lineHeight: 1.7, color: '#718096', fontSize: 13 }}>De applicatie kon deze pagina niet laden. Probeer het opnieuw.</p>
            <button type="button" onClick={reset} style={{ marginTop: 24, border: '1px solid #4f86e8', borderRadius: 7, background: '#4f86e8', color: '#fff', padding: '10px 16px', fontWeight: 650, cursor: 'pointer', boxShadow: '0 2px 5px rgba(79,134,232,.16)' }}>Opnieuw proberen</button>
          </section>
        </main>
      </body>
    </html>
  )
}
