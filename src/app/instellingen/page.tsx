import Link from 'next/link'
import { requireAuthenticatedUser } from '@/lib/authz'

type AdminLink = { title: string; description: string; href: string }
type AdminSection = { title: string; links: AdminLink[] }

export default async function InstellingenOverzicht() {
  const user = await requireAuthenticatedUser()
  const superAdmin = user.role === 'SUPER_ADMIN'
  const can = (permission: string) => superAdmin || user.permissions.some((value) => value === permission)

  const sections: AdminSection[] = [
    {
      title: 'Data en koppelingen',
      links: [
        ...(can('feeds.read') ? [{ title: 'Feedbeheer', description: 'Feeds per land toevoegen, synchroniseren en beheren.', href: '/instellingen/feedbeheer' }] : []),
        ...(can('settings.manage') ? [
          { title: 'Markten', description: 'Landen, btw en valuta.', href: '/instellingen/markten' },
          { title: 'Integraties', description: 'Externe databronnen en koppelingen.', href: '/integraties' },
        ] : []),
      ],
    },
    {
      title: 'Organisatie',
      links: [
        ...(can('users.manage') ? [{ title: 'Gebruikers en rechten', description: 'Beheer de toegang tot deze organisatie.', href: '/instellingen/gebruikers' }] : []),
        ...(superAdmin ? [{ title: 'Rollen en rechten', description: 'Bepaal welke functies iedere rol mag gebruiken.', href: '/instellingen/rollen' }] : []),
        ...(can('billing.manage') ? [{ title: 'Licentie en facturatie', description: 'Abonnement en facturatiegegevens.', href: '/instellingen/licentie' }] : []),
      ],
    },
    {
      title: 'Systeem',
      links: [
        ...(can('settings.manage') ? [{ title: 'Systeeminstellingen', description: 'Overige instellingen van de organisatie.', href: '/instellingen/systeem' }] : []),
        ...(superAdmin ? [
          { title: 'Organisaties', description: 'Organisaties van het platform beheren.', href: '/instellingen/organisaties' },
          { title: 'Gegevens verwijderen', description: 'Definitieve verwijderacties met extra bevestiging.', href: '/instellingen/data' },
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
                <span className="min-w-0"><span className="block text-[13px] font-semibold text-[#26364a]">{link.title}</span><span className="mt-0.5 block text-[11px] text-[#728095]">{link.description}</span></span>
                <span aria-hidden="true" className="text-[17px] text-[#8a98ab] group-hover:text-[#426dc4]">›</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
