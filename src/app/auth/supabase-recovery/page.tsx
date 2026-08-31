'use client'

import Image from 'next/image'
import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'

export default function SupabaseRecoveryPage() {
  const [accessToken, setAccessToken] = useState('')
  const [ready, setReady] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const token = params.get('access_token') ?? ''
      const type = params.get('type') ?? ''
      setAccessToken(type === 'recovery' ? token : '')
      setReady(true)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (newPassword.length < 12) {
      setError('Je nieuwe wachtwoord moet minimaal 12 tekens bevatten.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('De twee wachtwoorden zijn niet gelijk.')
      return
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '')
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
    if (!url || !publishableKey || !accessToken) {
      setError('Deze herstelkoppeling is ongeldig of verlopen. Vraag een nieuwe herstelmail aan.')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(`${url}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      })

      if (!response.ok) {
        setError('Het wachtwoord kon niet worden gewijzigd. Vraag een nieuwe herstelmail aan.')
        return
      }

      window.location.replace('/?reset=success')
    } catch {
      setError('Het wachtwoord kon niet worden gewijzigd. Probeer het opnieuw.')
    } finally {
      setSubmitting(false)
    }
  }

  const invalidToken = ready && !accessToken

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#07142d] via-[#102852] to-[#164487] px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute left-[-140px] top-[-130px] h-[360px] w-[360px] rounded-full bg-[#2458ff]/25 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-180px] right-[-110px] h-[440px] w-[440px] rounded-full bg-[#3f7cff]/20 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_42%)]" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.22)] ring-1 ring-white/60">
            <Image src="/prysight-logo.svg" alt="Prysight" width={520} height={140} priority className="h-auto w-[250px] sm:w-[270px]" />
          </div>
          <p className="mt-4 text-sm font-medium tracking-wide text-blue-100/80">Pricing Intelligence</p>
        </div>

        <section className="rounded-2xl bg-white p-6 shadow-2xl shadow-black/25 sm:p-8">
          <p className="text-sm font-semibold text-[#2458ff]">Accountbeveiliging</p>
          <h1 className="mt-1 text-xl font-semibold text-[#102042]">Nieuw wachtwoord instellen</h1>

          {!ready ? (
            <p className="mt-3 text-sm leading-6 text-slate-500">Herstelkoppeling controleren...</p>
          ) : invalidToken ? (
            <>
              <p className="mt-3 text-sm leading-6 text-slate-500">Deze herstelkoppeling is ongeldig of verlopen. Vraag vanaf het inlogscherm een nieuwe link aan.</p>
              <Link href="/?mode=forgot" className="mt-6 block w-full rounded-lg bg-gradient-to-r from-[#2458ff] to-[#3479ff] px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:from-[#1949e8] hover:to-[#2368ed]">Nieuwe herstelmail aanvragen</Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm leading-6 text-slate-500">Kies een nieuw wachtwoord van minimaal 12 tekens. Na opslaan kun je direct opnieuw inloggen.</p>
              {error ? <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Nieuw wachtwoord</span>
                  <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" minLength={12} required autoFocus className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-[#102042] outline-none transition focus:border-[#2458ff] focus:ring-2 focus:ring-[#2458ff]/20" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">Nieuw wachtwoord herhalen</span>
                  <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" minLength={12} required className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-[#102042] outline-none transition focus:border-[#2458ff] focus:ring-2 focus:ring-[#2458ff]/20" />
                </label>
                <button type="submit" disabled={submitting} className="w-full rounded-lg bg-gradient-to-r from-[#2458ff] to-[#3479ff] px-4 py-2.5 text-sm font-semibold text-white transition hover:from-[#1949e8] hover:to-[#2368ed] focus:outline-none focus:ring-2 focus:ring-[#2458ff] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Opslaan...' : 'Wachtwoord opslaan'}</button>
              </form>
            </>
          )}
        </section>

        <p className="mt-6 text-center text-xs font-medium text-blue-100/75">Copyright © 2026 · Made by Pformance</p>
      </div>
    </main>
  )
}
