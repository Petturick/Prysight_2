'use server'

import { randomUUID } from 'node:crypto'
import { Prisma } from '@/generated/prisma/client'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/authz'
import { normalizeCooldownHours, normalizePricingMode } from '@/lib/product-settings'
import { prisma } from '@/lib/prisma'

function text(formData: FormData, key: string) { return String(formData.get(key) ?? '').trim() }

export async function saveProductSettingAction(formData: FormData) {
  const actor = await requirePermission('pricing.manage')
  const productId = text(formData, 'productId') || null
  const productGroupId = text(formData, 'productGroupId') || null
  if (Boolean(productId) === Boolean(productGroupId)) throw new Error('Kies precies één product of productgroep.')
  const mode = normalizePricingMode(text(formData, 'mode'), productId ? 'INHERIT' : 'ADVISE')
  if (!productId && mode === 'INHERIT') throw new Error('Een productgroep kan niet op Overnemen staan.')
  const cooldownHours = normalizeCooldownHours(text(formData, 'cooldownHours'), 24)

  if (productId) {
    const product = await prisma.product.findFirst({ where: { id: productId, companyId: actor.companyId }, select: { id: true } })
    if (!product) throw new Error('Product niet gevonden.')
  } else {
    const group = await prisma.productGroup.findFirst({ where: { id: productGroupId!, companyId: actor.companyId }, select: { id: true } })
    if (!group) throw new Error('Productgroep niet gevonden.')
  }

  const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    select id from product_settings where company_id = ${actor.companyId}
      and ((${productId}::text is not null and product_id = ${productId} and product_group_id is null)
        or (${productGroupId}::text is not null and product_group_id = ${productGroupId} and product_id is null))
    limit 1
  `)
  if (existing[0]) {
    await prisma.$executeRaw(Prisma.sql`update product_settings set mode = ${mode}, cooldown_hours = ${cooldownHours}, is_active = true, updated_at = now() where id = ${existing[0].id} and company_id = ${actor.companyId}`)
  } else {
    const id = `pst_${randomUUID().replace(/-/g, '')}`
    await prisma.$executeRaw(Prisma.sql`insert into product_settings (id, company_id, product_id, product_group_id, mode, cooldown_hours, is_active, updated_at) values (${id}, ${actor.companyId}, ${productId}, ${productGroupId}, ${mode}, ${cooldownHours}, true, now())`)
  }
  revalidatePath('/prijsautomatisering'); revalidatePath('/prijsstrategie'); revalidatePath('/producten')
}
