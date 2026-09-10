import Link from 'next/link'
import { requireAuthenticatedUser } from '@/lib/authz'
import { getOnboardingState } from '@/lib/onboarding'

export async function OnboardingReminder() {
  const user = await requireAuthenticatedUser()
  const state = await getOnboardingState(user.companyId)
  if (!state.nextStep) return null
  return <section className="flex flex-col gap-4 rounded-[12px] border border-[#bcd4f5] bg-[#f1f7ff] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[#5c7eaa]">Configuratie {state.progress}%</p><p className="mt-1 text-[13px] font-bold text-[#273b55]">Volgende stap, {state.nextStep.title}</p><p className="mt-1 text-[10px] text-[#6f8198]">{state.nextStep.description}</p></div><Link href="/onboarding" className="primary-action shrink-0">Ga verder</Link></section>
}
