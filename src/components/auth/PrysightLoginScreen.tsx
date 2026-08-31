'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { loginAction } from '@/app/actions/authActions'
import { requestPasswordResetAction } from '@/app/actions/passwordResetActions'

type LoginSearchParams = {
  error?: string
  mode?: string
  reset?: string
}

const loginErrors: Record<string, string> = {
  missing: 'Vul je e-mailadres en wachtwoord in.',
  credentials: 'E-mailadres of wachtwoord is onjuist.',
}

function EyeIcon({ hidden = false }: { hidden?: boolean }) {
  return hidden ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 002.8 2.8" />
      <path d="M9.9 4.2A10.7 10.7 0 0112 4c5.5 0 9.5 5 9.5 5a18.7 18.7 0 01-3.1 3.7" />
      <path d="M6.6 6.6C4.2 8 2.5 10.5 2.5 10.5S6.5 16 12 16c1 0 2-.2 2.9-.5" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 12S6.5 6.5 12 6.5 21.5 12 21.5 12 17.5 17.5 12 17.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

export function PrysightLoginScreen({
  params,
  loginPath,
}: {
  params: LoginSearchParams
  loginPath: '/' | '/login'
}) {
  const [showPassword, setShowPassword] = useState(false)
  const forgotMode = params.mode === 'forgot'
  const loginError = params.error ? loginErrors[params.error] : null
  const resetRequested = params.reset === 'requested'
  const resetSucceeded = params.reset === 'success'
  const resetUnavailable = params.reset === 'unavailable'

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
          {forgotMode ? (
            <>
              <Link href={loginPath} className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-[#2458ff]">
                <span aria-hidden="true">←</span>
                Terug naar inloggen
              </Link>

              <h1 className="text-xl font-semibold text-[#102042]">Wachtwoord resetten</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">Vul je e-mailadres in en we sturen je een beveiligde link om je Prysight-wachtwoord te herstellen.</p>

              {resetRequested ? (
                <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
                  Als het e-mailadres bij een actief Prysight-account hoort, is de herstelmail verzonden. Controleer ook je ongewenste e-mail.
                </div>
              ) : null}

              {resetUnavailable ? (
                <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                  De herstelmailservice is nog niet geconfigureerd. De beheerder moet de mailinstellingen van Prysight afronden.
                </div>
              ) : null}

              {params.error === 'reset-missing' ? (
                <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Vul een geldig e-mailadres in.</div>
              ) : null}

              {!resetRequested ? (
                <form action={requestPasswordResetAction} className="mt-6 space-y-4">
                  <input type="hidden" name="loginPath" value={loginPath} />
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">E-mailadres</span>
                    <input name="email" type="email" autoComplete="email" required autoFocus className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-[#102042] outline-none transition focus:border-[#2458ff] focus:ring-2 focus:ring-[#2458ff]/20" placeholder="naam@bedrijf.nl" />
                  </label>
                  <button type="submit" className="w-full rounded-lg bg-gradient-to-r from-[#2458ff] to-[#3479ff] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-[#1949e8] hover:to-[#2368ed] focus:outline-none focus:ring-2 focus:ring-[#2458ff] focus:ring-offset-2">Resetlink versturen</button>
                </form>
              ) : null}
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-[#102042]">Inloggen</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">Log in bij Prysight om je prijsmonitoring en concurrentie-inzichten te openen.</p>

              {loginError ? <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{loginError}</div> : null}
              {resetSucceeded ? <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Je wachtwoord is gewijzigd. Je kunt nu inloggen met je nieuwe wachtwoord.</div> : null}

              <form action={loginAction} className="mt-6 space-y-4">
                <input type="hidden" name="loginPath" value={loginPath} />
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">E-mailadres</span>
                  <input name="email" type="email" autoComplete="email" required autoFocus className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-[#102042] outline-none transition placeholder:text-slate-400 focus:border-[#2458ff] focus:ring-2 focus:ring-[#2458ff]/20" placeholder="naam@bedrijf.nl" />
                </label>

                <label className="block">
                  <span className="mb-1.5 flex items-center justify-between gap-4 text-sm font-medium text-slate-700">
                    <span>Wachtwoord</span>
                    <Link href={`${loginPath}?mode=forgot`} className="text-xs font-semibold text-[#2458ff] transition hover:text-[#1749dc]">Wachtwoord vergeten?</Link>
                  </span>
                  <span className="relative block">
                    <input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 pr-11 text-sm text-[#102042] outline-none transition placeholder:text-slate-400 focus:border-[#2458ff] focus:ring-2 focus:ring-[#2458ff]/20" placeholder="Voer je wachtwoord in" />
                    <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-[#2458ff] focus:outline-none">
                      <EyeIcon hidden={showPassword} />
                    </button>
                  </span>
                </label>

                <button type="submit" className="w-full rounded-lg bg-gradient-to-r from-[#2458ff] to-[#3479ff] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-[#1949e8] hover:to-[#2368ed] focus:outline-none focus:ring-2 focus:ring-[#2458ff] focus:ring-offset-2">Inloggen</button>
              </form>
            </>
          )}
        </section>

        <p className="mt-6 text-center text-xs font-medium text-blue-100/75">Copyright © 2026 · Made by Pformance</p>
      </div>
    </main>
  )
}
