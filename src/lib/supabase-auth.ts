type SupabaseAuthConfig = {
  url: string
  publishableKey: string
}

export type SupabasePasswordVerification = 'valid' | 'invalid' | 'unavailable'

export function getSupabaseAuthConfig(): SupabaseAuthConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '')
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()

  if (!url || !publishableKey) return null
  return { url, publishableKey }
}

export async function verifySupabasePassword(email: string, password: string): Promise<SupabasePasswordVerification> {
  const config = getSupabaseAuthConfig()
  if (!config) return 'unavailable'

  try {
    const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: config.publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    })

    if (response.ok) return 'valid'
    if (response.status === 400 || response.status === 401) return 'invalid'
    return 'unavailable'
  } catch {
    return 'unavailable'
  }
}

export async function sendSupabasePasswordRecovery(email: string, redirectTo: string): Promise<boolean> {
  const config = getSupabaseAuthConfig()
  if (!config) return false

  try {
    const response = await fetch(`${config.url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: 'POST',
      headers: {
        apikey: config.publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
      cache: 'no-store',
    })

    return response.ok
  } catch {
    return false
  }
}
