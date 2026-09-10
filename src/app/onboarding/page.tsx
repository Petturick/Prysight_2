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
    <section className="overflow-hidden rounded-[16px] border border-[#dfe5ee] bg-white shadow-[0_8px_30px_rgba(31,49,77,.06)]">
      <div className="px-6 py-7 sm:px-8"><p className="eyebrow">Aan de slag</p><div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-[30px] font-bold tracking-[-.04em] text-[#17233a]">Maak {company?.name ?? 'je organisatie'} klaar voor prijsmonitoring</h1><p className="mt-2 max-w-2xl text-[12px] leading-6 text-[#68778c]">Je hoeft Prysight niet te leren. Volg alleen de eerstvolgende stap, Prysight controleert automatisch wat al klaar is.</p></div><div className="rounded-[12px] bg-[#f2f6fb] px-5 py-4 text-right"><p className="text-[10px] font-semibold text-[#77869a]">Voortgang</p><p className="mt-1 text-[28px] font-bold text-[#17233a]">{state.progress}%</p></div></div><div className="mt-6 h-2 overflow-hidden rounded-full bg-[#edf1f6]"><div className="h-full rounded-full bg-[#4f86e8] transition-all" style={{ width: `${state.progress}%` }} /></div></div>
      {next ? <div className="border-t border-[#e7ebf1] bg-[#f9fbfd] px-6 py-5 sm:px-8"><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[#74849a]">Volgende stap</p><div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[15px] font-bold text-[#22324a]">{next.title}</p><p className="mt-1 text-[11px] text-[#6c7b8f]">{next.description}</p></div><Link href={next.href} className="primary-action shrink-0">Ga verder</Link></div></div> : <div className="border-t border-[#cbe8d8] bg-[#eff9f4] px-6 py-5 text-[12px] font-semibold text-[#146847] sm:px-8">Je basisconfiguratie is compleet. Prysight kan nu zelfstandig blijven monitoren.</div>}
    </section>

    <section className="grid gap-3">{state.steps.map((step, index) => <Link key={step.key} href={step.href} className={`group flex items-start gap-4 rounded-[13px] border bg-white p-5 transition hover:-translate-y-px hover:shadow-[0_7px_20px_rgba(31,49,77,.06)] ${step.complete ? 'border-[#dfe6ec]' : step.key === next?.key ? 'border-[#9fc1f6] ring-2 ring-[#e9f2ff]' : 'border-[#e4e9f0]'}`}><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${step.complete ? 'bg-[#eaf7f0] text-[#21865d]' : step.key === next?.key ? 'bg-[#4f86e8] text-white' : 'bg-[#f1f4f8] text-[#8090a5]'}`}>{step.complete ? '✓' : index + 1}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="text-[13px] font-bold text-[#26364e]">{step.title}</p><span className={`text-[10px] font-semibold ${step.complete ? 'text-[#21865d]' : 'text-[#4f7fca]'}`}>{step.complete ? 'Klaar' : 'Openen'}</span></div><p className="mt-1 text-[11px] leading-5 text-[#718096]">{step.description}</p></div></Link>)}</section>

    {company?.license ? <section className="rounded-[12px] border border-[#e2e7ee] bg-white px-5 py-4 text-[11px] text-[#67768a]"><span className="font-semibold text-[#2b3b53]">Accountstatus, </span>{company.license.status === 'TRIALING' ? `proefperiode actief${company.license.trialEndsAt ? ` tot ${new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'long',year:'numeric'}).format(company.license.trialEndsAt)}` : ''}` : company.license.status.toLowerCase().replace('_',' ')}.</section> : null}
  </div>
}
