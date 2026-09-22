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
      title: 'Data en markten',
      links: [
        ...(can('feeds.read') ? [
          { title: 'Feedbeheer', description: 'Feeds per land, activeren, pauzeren, synchroniseren en verwijderen.', href: '/instellingen/feedbeheer' },
          { title: 'Producten beheren', description: 'Selecteer producten, bekijk producten per feed of verwijder de selectie.', href: '/producten' },
        ] : []),
        ...(can('settings.manage') ? [{ title: 'Markten', description: 'Beheer de landen waarin je actief bent.', href: '/instellingen/markten' }] : []),
        ...(superAdmin ? [{ title: 'Data beheer', description: 'Centrale toegang tot productdata en feedbeheer.', href: '/instellingen/data' }] : []),
      ],
    },
    {
      title: 'Gebruikers en toegang',
      links: [
        ...(can('users.manage') ? [
          { title: 'Team', description: 'Beheer leden van deze organisatie.', href: '/instellingen/team' },
          { title: 'Gebruikers', description: 'Bekijk gebruikers en hun toegang.', href: '/instellingen/gebruikers' },
        ] : []),
        ...(superAdmin ? [
          { title: 'Rollen en rechten', description: 'Maak rollen aan en bepaal rechten in de matrix.', href: '/instellingen/rollen' },
          { title: 'Organisaties', description: 'Beheer de organisaties op het platform.', href: '/instellingen/organisaties' },
        ] : []),
      ],
    },
    {
      title: 'Platform',
      links: [
        ...(can('settings.manage') ? [
          { title: 'Integraties', description: 'Beheer de verbindingen met je databronnen.', href: '/integraties' },
          { title: 'Systeem', description: 'Wijzig de algemene instellingen.', href: '/instellingen/systeem' },
        ] : []),
        ...(can('billing.manage') ? [{ title: 'Licentie en facturatie', description: 'Beheer het abonnement en de licentie.', href: '/instellingen/licentie' }] : []),
        { title: 'Mijn profiel', description: 'Bekijk en wijzig je accountgegevens.', href: '/instellingen/profiel' },
      ],
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[18px] font-semibold text-[#172033]">Wat wil je beheren?</h2>
        <p className="mt-1 text-[12px] text-[#697386]">Kies een onderdeel. Je ziet alleen de opties waarvoor je toegang hebt.</p>
      </div>
      {sections.filter((section) => section.links.length > 0).map((section) => (
        <section key={section.title} className="space-y-3">
          <h3 className="text-[12px] font-semibold text-[#586579]">{section.title}</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {section.links.map((link) => (
              <Link href={link.href} key={link.href} className="surface-card flex min-h-[114px] flex-col justify-between p-4 transition-colors hover:border-[#a8bfde] hover:bg-[#fafcff]">
                <span className="text-[13px] font-semibold text-[#26364a]">{link.title}</span>
                <span className="mt-2 text-[11px] leading-5 text-[#728095]">{link.description}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
