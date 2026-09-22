import { SettingsTabs } from '@/components/SettingsTabs'
import { requireAuthenticatedUser } from '@/lib/authz'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuthenticatedUser()
  return (
    <div className="space-y-5">
      <section className="strong-panel px-5 py-5 sm:px-6">
        <p className="eyebrow">Prysight</p>
        <h1 className="mt-2 text-[27px] font-semibold tracking-[-0.035em] text-[#161a26]">Beheer</h1>
        <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#697386]">Producten, feeds, gebruikers en instellingen op één centrale plek.</p>
      </section>
      <div className="grid min-w-0 gap-5 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start">
        <SettingsTabs role={user.role} permissions={user.permissions} />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}
