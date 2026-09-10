import OneGlanceDashboardPage from '@/components/OneGlanceDashboardPage'
import { OnboardingReminder } from '@/components/OnboardingReminder'

export const dynamic = 'force-dynamic'

export default function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <div className="space-y-5"><OnboardingReminder /><OneGlanceDashboardPage searchParams={searchParams} /></div>
}
