import type { Metadata } from 'next'
import { auth } from '@/auth'
import { AppShell } from '@/components/AppShell'
import './globals.css'

export const metadata: Metadata = {
  title: 'PrySight pricing intelligence',
  description: 'Prijsmonitoring, concurrentie-intelligentie en prijsadvies voor Engels Group.',
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth()

  return (
    <html lang="nl" className="h-full antialiased">
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)]">
        <AppShell user={session?.user ?? null}>{children}</AppShell>
      </body>
    </html>
  )
}
