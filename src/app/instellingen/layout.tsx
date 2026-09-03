import { SettingsTabs } from '@/components/SettingsTabs'
import { requireAuthenticatedUser } from '@/lib/authz'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuthenticatedUser()
  return <div className="space-y-5"><section className="strong-panel px-5 py-5 sm:px-6"><p className="eyebrow">Platformbeheer</p><h1 className="mt-2 text-[29px] font-semibold tracking-[-0.035em] text-[#161a26]">Instellingen</h1><p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#697386]">Beheer organisaties, gebruikers, rechten, integraties en toegang tot Prysight vanuit één centrale omgeving.</p></section><SettingsTabs role={user.role} permissions={user.permissions} /><div>{children}</div></div>
}
