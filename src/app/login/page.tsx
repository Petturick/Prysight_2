import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { PrysightLoginScreen } from '@/components/auth/PrysightLoginScreen'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; mode?: string; reset?: string }>
}) {
  const session = await auth()
  if (session?.user) redirect('/dashboard')

  const params = await searchParams
  return <PrysightLoginScreen params={params} loginPath="/login" />
}
