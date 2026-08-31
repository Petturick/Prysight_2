import { changePasswordAction } from '@/app/actions/accountActions'
import { requireAuthenticatedUser } from '@/lib/authz'

const errorMessages: Record<string, string> = {
  missing: 'Vul alle wachtwoordvelden in.',
  length: 'Je nieuwe wachtwoord moet minimaal 12 tekens bevatten.',
  match: 'De twee nieuwe wachtwoorden zijn niet gelijk.',
  current: 'Je huidige wachtwoord is niet correct.',
}

export default async function PasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireAuthenticatedUser()
  const params = await searchParams
  const errorMessage = params.error ? errorMessages[params.error] : null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm font-medium text-[#667085]">Accountbeveiliging</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-[#171b28]">Wachtwoord wijzigen</h1>
        <p className="mt-2 text-sm leading-6 text-[#667085]">Aangemeld als {user.email}. Na het wijzigen word je automatisch uitgelogd en log je opnieuw in met je nieuwe wachtwoord.</p>
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-sm sm:p-8">
        {errorMessage ? <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{errorMessage}</div> : null}
        <form action={changePasswordAction} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[#344054]">Huidig wachtwoord</span>
            <input name="currentPassword" type="password" autoComplete="current-password" required className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[#344054]">Nieuw wachtwoord</span>
            <input name="newPassword" type="password" autoComplete="new-password" minLength={12} required className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[#344054]">Nieuw wachtwoord herhalen</span>
            <input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]" />
          </label>
          <button type="submit" className="w-full rounded-xl bg-[#171b28] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#252b3b]">Wachtwoord opslaan</button>
        </form>
      </div>
    </div>
  )
}
