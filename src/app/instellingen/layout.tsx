import { SettingsTabs } from '@/components/SettingsTabs'
import { requireAuthenticatedUser } from '@/lib/authz'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuthenticatedUser()
  return (
    <div className="space-y-5">
      <header className="px-1 pt-1">
        <h1 className="text-[23px] font-semibold tracking-[-0.025em] text-[#172033]">Beheer</h1>
        <p className="mt-1 text-[12px] text-[#697386]">Gegevens, toegang en koppelingen.</p>
      </header>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start">
        <SettingsTabs role={user.role} permissions={user.permissions} />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
