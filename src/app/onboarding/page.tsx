export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireAuthenticatedUser } from '@/lib/authz'
import { getOnboardingState } from '@/lib/onboarding'
import { prisma } from '@/lib/prisma'

export default async function OnboardingPage() {
  const user = await requireAuthenticatedUser()
  const [state, company] = await Promise.all([
    getOnboardingState(user.companyId),
    prisma.company.findUnique({ where: { id: user.companyId }, select: { name: true, license: { select: { status: true, trialEndsAt: true } } } }),
  ])
  const next = state.nextStep
  return <div className="mx-auto max-w-[980px] space-y-5">
    <section className="overflow-hidden rounded-[14px] border border-[#dfe5ee] bg-white">
      <div className="flex items-center justify-between gap-4 px-5 py-4"><div><p className="text-[12px] font-semibold text-[#344054]">{company?.name ?? 'Organisatie'}</p><p className="mt-1 text-[11px] text-[#7a8798]">Configuratie</p></div><p className="text-[24px] font-semibold text-[#17233a]">{state.progress}%</p></div>
      <div className="h-1.5 bg-[#edf1f6]"><div className="h-full bg-[#4f86e8] transition-all" style={{ width: `${state.progress}%` }} /></div>
      {next ? <div className="flex flex-col gap-3 border-t border-[#e7ebf1] bg-[#f9fbfd] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-semibold text-[#74849a]">Volgende stap</p><p className="mt-1 text-[14px] font-semibold text-[#22324a]">{next.title}</p></div><Link href={next.href} className="primary-action shrink-0">Ga verder</Link></div> : <div className="border-t border-[#cbe8d8] bg-[#eff9f4] px-5 py-4 text-[12px] font-semibold text-[#146847]">Configuratie compleet</div>}
    </section>

    <section className="grid gap-3">{state.steps.map((step, index) => <Link key={step.key} href={step.href} className={`group flex items-start gap-4 rounded-[13px] border bg-white p-5 transition hover:-translate-y-px hover:shadow-[0_7px_20px_rgba(31,49,77,.06)] ${step.complete ? 'border-[#dfe6ec]' : step.key === next?.key ? 'border-[#9fc1f6] ring-2 ring-[#e9f2ff]' : 'border-[#e4e9f0]'}`}><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${step.complete ? 'bg-[#eaf7f0] text-[#21865d]' : step.key === next?.key ? 'bg-[#4f86e8] text-white' : 'bg-[#f1f4f8] text-[#8090a5]'}`}>{step.complete ? '✓' : index + 1}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="text-[13px] font-semibold text-[#26364e]">{step.title}</p><span className={`text-[10px] font-semibold ${step.complete ? 'text-[#21865d]' : 'text-[#4f7fca]'}`}>{step.complete ? 'Klaar' : 'Openen'}</span></div>{step.key === next?.key ? <p className="mt-1 text-[11px] leading-5 text-[#718096]">{step.description}</p> : null}</div></Link>)}</section>

    {company?.license ? <section className="rounded-[12px] border border-[#e2e7ee] bg-white px-5 py-4 text-[11px] text-[#67768a]"><span className="font-semibold text-[#2b3b53]">Accountstatus, </span>{company.license.status === 'TRIALING' ? `proefperiode actief${company.license.trialEndsAt ? ` tot ${new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric'}).format(company.license.trialEndsAt)}` : ''}` : company.license.status.toLowerCase().replace('_',' ')}.</section> : null}
  </div>
}
