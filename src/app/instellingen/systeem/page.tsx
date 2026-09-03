import Link from 'next/link'
import { requirePermission } from '@/lib/authz'

export default async function SysteemPage() {
  await requirePermission('settings.manage')
  return <section className="strong-panel p-5"><h2 className="text-[15px] font-bold text-[#252a37]">Systeeminstellingen</h2><p className="mt-1 text-[10px] leading-5 text-[#8790a2]">Technische beheeropties blijven centraal en rechten gestuurd.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Link href="/beheer/landen" className="surface-card p-4"><p className="text-[12px] font-bold text-[#252a37]">Landen</p><p className="mt-1 text-[10px] text-[#8790a2]">Markten en valuta beheren</p></Link><Link href="/beheer/productgroepen" className="surface-card p-4"><p className="text-[12px] font-bold text-[#252a37]">Productgroepen</p><p className="mt-1 text-[10px] text-[#8790a2]">Structuur van productdata beheren</p></Link><Link href="/beheer/webshops" className="surface-card p-4"><p className="text-[12px] font-bold text-[#252a37]">Webshops</p><p className="mt-1 text-[10px] text-[#8790a2]">Bronnen en websites beheren</p></Link></div></section>
}
