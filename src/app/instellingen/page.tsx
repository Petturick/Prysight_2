import Link from 'next/link'
import { requireAuthenticatedUser } from '@/lib/authz'

type AdminLink = { title: string; href: string }
type AdminSection = { title: string; links: AdminLink[] }

export default async function InstellingenOverzicht() {
  const user = await requireAuthenticatedUser()
  const superAdmin = user.role === 'SUPER_ADMIN'
  const can = (permission: string) => superAdmin || user.permissions.some((value) => value === permission)

  const sections: AdminSection[] = [
    {
      title: 'Data en koppelingen',
      links: [
        ...(can('feeds.read') ? [{ title: 'Feedbeheer', href: '/instellingen/feedbeheer' }] : []),
        ...(can('settings.manage') ? [
          { title: 'Markten', href: '/instellingen/markten' },
          { title: 'Integraties', href: '/integraties' },
        ] : []),
      ],
    },
    {
      title: 'Organisatie',
      links: [
        ...(can('users.manage') ? [{ title: 'Gebruikers en rechten', href: '/instellingen/gebruikers' }] : []),
        ...(superAdmin ? [{ title: 'Rollen en rechten', href: '/instellingen/rollen' }] : []),
        ...(can('billing.manage') ? [{ title: 'Licentie en facturatie', href: '/instellingen/licentie' }] : []),
      ],
    },
    {
      title: 'Systeem',
      links: [
        ...(can('settings.manage') ? [{ title: 'Systeeminstellingen', href: '/instellingen/systeem' }] : []),
        ...(superAdmin ? [
          { title: 'Organisaties', href: '/instellingen/organisaties' },
          { title: 'Gegevens verwijderen', href: '/instellingen/data' },
        ] : []),
      ],
    },
  ]

  return (
    <div className="space-y-5">
      {sections.filter((section) => section.links.length > 0).map((section) => (
        <section key={section.title} className="overflow-hidden rounded-[14px] border border-[#e2e7ee] bg-white">
          <h2 className="border-b border-[#e8edf3] bg-[#f8fafc] px-4 py-3 text-[12px] font-semibold text-[#53647a]">{section.title}</h2>
          <div className="divide-y divide-[#edf1f5]">
            {section.links.map((link) => (
              <Link href={link.href} key={link.href} className="group flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-[#f7faff] focus-visible:outline-2 focus-visible:outline-[#4b78c7]">
                <span className="text-[13px] font-semibold text-[#26364a]">{link.title}</span>
                <span aria-hidden="true" className="text-[17px] text-[#8a98ab] group-hover:text-[#426dc4]">›</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
