import { Suspense } from 'react'
import OneGlanceDashboardPage from '@/components/OneGlanceDashboardPage'
import { OnboardingReminder } from '@/components/OnboardingReminder'

export const dynamic = 'force-dynamic'

function DashboardSkeleton() {
  return <div className="space-y-5" aria-label="Dashboard laden">
    <section className="flex items-end justify-between gap-6">
      <div className="space-y-3">
        <div className="h-3 w-44 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-72 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-[32rem] max-w-full animate-pulse rounded bg-slate-100" />
      </div>
      <div className="hidden h-11 w-60 animate-pulse rounded-xl bg-slate-100 md:block" />
    </section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[148px] animate-pulse rounded-2xl border border-slate-100 bg-white shadow-sm" />)}
    </section>
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,.72fr)]">
      <div className="h-[340px] animate-pulse rounded-2xl border border-slate-100 bg-white shadow-sm" />
      <div className="h-[340px] animate-pulse rounded-2xl border border-slate-100 bg-white shadow-sm" />
    </section>
  </div>
}

export default function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <div className="space-y-5">
    <Suspense fallback={null}><OnboardingReminder /></Suspense>
    <Suspense fallback={<DashboardSkeleton />}><OneGlanceDashboardPage searchParams={searchParams} /></Suspense>
  </div>
}
