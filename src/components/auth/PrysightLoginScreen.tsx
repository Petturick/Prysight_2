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

function MailIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
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
    <main className="relative flex min-h-screen items-center justify-center bg-[#f0f5f9] px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2458ff] to-[#1689b7] shadow-lg shadow-blue-500/20">
            <Image src="/prysight-logo-sidebar.svg" alt="Prysight" width={40} height={40} priority className="h-9 w-9 object-contain brightness-0 invert" />
          </div>
          <Image src="/prysight-logo.svg" alt="Prysight" width={520} height={140} priority className="mx-auto h-auto w-[220px]" />
          <p className="mt-1 text-sm text-slate-400">Pricing Intelligence</p>
        </div>

        <section className="rounded-2xl bg-white p-8 shadow-2xl shadow-slate-300/50">
          {!forgotMode ? (
            <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
              <button type="button" className="flex-1 rounded-md bg-white py-2 text-sm font-medium text-slate-900 shadow">Inloggen</button>
              <button type="button" disabled className="flex-1 cursor-default rounded-md py-2 text-sm font-medium text-slate-400" title="Beschikbaar zodra self service registratie voor Prysight wordt geactiveerd">Gratis starten</button>
            </div>
          ) : null}

          {forgotMode ? (
            <>
              <h1 className="text-xl font-semibold text-slate-900">Wachtwoord resetten</h1>
              <p className="mt-2 text-sm text-slate-500">Je ontvangt een beveiligde resetlink per e-mail.</p>

              {resetRequested ? (
                <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
                  Als het e-mailadres bij een actief Prysight account hoort, is de herstelmail verzonden. Controleer ook je ongewenste e-mail.
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
                    <input name="email" type="email" autoComplete="email" required autoFocus className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#2458ff] focus:ring-2 focus:ring-[#2458ff]" placeholder="naam@bedrijf.nl" />
                  </label>
                  <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#2458ff] to-[#1689b7] px-4 py-2.5 text-sm font-medium text-white transition hover:from-[#1749dc] hover:to-[#11789f] focus:outline-none focus:ring-2 focus:ring-[#2458ff] focus:ring-offset-2">
                    <MailIcon />
                    Resetlink versturen
                  </button>
                </form>
              ) : null}

              <Link href={loginPath} className="mt-4 block w-full text-center text-sm text-slate-500 transition hover:text-slate-800">Terug naar inloggen</Link>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-slate-900">Inloggen</h1>
              <p className="mt-2 text-sm text-slate-500">Gebruik je Prysight account om verder te gaan.</p>

              {loginError ? <div className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{loginError}</div> : null}
              {resetSucceeded ? <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">Je wachtwoord is gewijzigd. Je kunt nu inloggen met je nieuwe wachtwoord.</div> : null}

              <form action={loginAction} className="mt-6 space-y-4">
                <input type="hidden" name="loginPath" value={loginPath} />
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">E-mailadres</span>
                  <input name="email" type="email" autoComplete="email" required autoFocus className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#2458ff] focus:ring-2 focus:ring-[#2458ff]" placeholder="naam@bedrijf.nl" />
                </label>

                <label className="block">
                  <span className="mb-1.5 flex items-center justify-between gap-4 text-sm font-medium text-slate-700">
                    <span>Wachtwoord</span>
                    <Link href={`${loginPath}?mode=forgot`} className="text-xs font-medium text-[#2458ff] transition hover:text-[#1749dc]">Wachtwoord vergeten?</Link>
                  </span>
                  <span className="relative block">
                    <input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#2458ff] focus:ring-2 focus:ring-[#2458ff]" placeholder="Voer je wachtwoord in" />
                    <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Wachtwoord verbergen' : 'Wachtwoord tonen'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-[#2458ff] focus:outline-none">
                      <EyeIcon hidden={showPassword} />
                    </button>
                  </span>
                </label>

                <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#2458ff] to-[#1689b7] px-4 py-2.5 text-sm font-medium text-white transition hover:from-[#1749dc] hover:to-[#11789f] focus:outline-none focus:ring-2 focus:ring-[#2458ff] focus:ring-offset-2">
                  <MailIcon />
                  Inloggen
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-slate-500">Pformance B.V. © 2026 · Prysight</div>
    </main>
  )
}
