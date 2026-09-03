import Link from 'next/link'
import { requireAuthenticatedUser } from '@/lib/authz'

export default async function ProfielPage() {
  const user = await requireAuthenticatedUser()
  return <section className="strong-panel p-5"><h2 className="text-[15px] font-bold text-[#252a37]">Mijn profiel</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-[12px] bg-[#f6f8fb] p-4"><p className="text-[9px] font-black uppercase tracking-[.08em] text-[#98a2b3]">Naam</p><p className="mt-1 text-[12px] font-bold text-[#252a37]">{user.name}</p></div><div className="rounded-[12px] bg-[#f6f8fb] p-4"><p className="text-[9px] font-black uppercase tracking-[.08em] text-[#98a2b3]">E mail</p><p className="mt-1 text-[12px] font-bold text-[#252a37]">{user.email}</p></div><div className="rounded-[12px] bg-[#f6f8fb] p-4"><p className="text-[9px] font-black uppercase tracking-[.08em] text-[#98a2b3]">Platformrol</p><p className="mt-1 text-[12px] font-bold text-[#252a37]">{user.role}</p></div><div className="rounded-[12px] bg-[#f6f8fb] p-4"><p className="text-[9px] font-black uppercase tracking-[.08em] text-[#98a2b3]">Organisatierol</p><p className="mt-1 text-[12px] font-bold text-[#252a37]">{user.customRoleName ?? user.membershipRole}</p></div></div><Link href="/account/password" className="primary-action mt-4 inline-flex">Wachtwoord wijzigen</Link></section>
}
