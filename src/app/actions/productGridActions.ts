'use server'

import { revalidatePath } from 'next/cache'
import { Prisma } from '@/generated/prisma/client'
import { createAuditLog } from '@/lib/audit'
import { requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

function text(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeBarcode(value: string) {
  return value.replace(/[^0-9]/g, '')
}

function isPlaceholderName(value: string) {
  return /^[☐☑☒□■✓✔✕✖xX0-1]+$/.test(value.trim())
}

export async function updateProductGridFieldAction(formData: FormData) {
  const actor = await requirePermission('products.write')
  const productId = text(formData, 'productId')
  const field = text(formData, 'field')
  const rawValue = text(formData, 'value')
  if (!productId) throw new Error('Product ontbreekt.')
  if (!['articleNumber', 'name', 'ean'].includes(field)) throw new Error('Dit veld kan niet vanuit het overzicht worden gewijzigd.')

  const product = await prisma.product.findFirst({
    where: { id: productId, companyId: actor.companyId, isActive: true },
    select: { id: true, articleNumber: true, name: true, ean: true, gtin: true },
  })
  if (!product) throw new Error('Product niet gevonden.')

  let value: string | null = rawValue
  if (field === 'articleNumber') {
    if (!rawValue) throw new Error('Artikelnummer mag niet leeg zijn.')
    const duplicate = await prisma.product.findUnique({
      where: { companyId_articleNumber: { companyId: actor.companyId, articleNumber: rawValue } },
      select: { id: true },
    })
    if (duplicate && duplicate.id !== product.id) throw new Error('Dit artikelnummer bestaat al.')
  }
  if (field === 'name') {
    if (!rawValue || rawValue.length < 3 || isPlaceholderName(rawValue)) throw new Error('Vul een geldige productnaam in.')
  }
  if (field === 'ean') {
    value = normalizeBarcode(rawValue) || null
    if (value && ![8, 12, 13, 14].includes(value.length)) throw new Error('EAN of GTIN moet 8, 12, 13 of 14 cijfers bevatten.')
    if (value) {
      const duplicate = await prisma.product.findFirst({
        where: {
          companyId: actor.companyId,
          id: { not: product.id },
          OR: [{ ean: value }, { gtin: value }],
        },
        select: { id: true },
      })
      if (duplicate) throw new Error('Deze EAN of GTIN is al gekoppeld aan een ander product.')
    }
  }

  const oldValue = field === 'articleNumber' ? product.articleNumber : field === 'name' ? product.name : product.ean
  if ((oldValue ?? '') === (value ?? '')) return

  const data: Prisma.ProductUpdateInput = field === 'articleNumber'
    ? { articleNumber: value as string }
    : field === 'name'
      ? { name: value as string }
      : { ean: value, ...(product.gtin === product.ean ? { gtin: value } : {}) }

  await prisma.product.update({ where: { id: product.id }, data })

  await createAuditLog({
    companyId: actor.companyId,
    userId: actor.id,
    action: 'PRODUCT_GRID_FIELD_UPDATED',
    entityType: 'Product',
    entityId: product.id,
    oldValue: { field, value: oldValue },
    newValue: { field, value },
  })

  revalidatePath('/producten')
  revalidatePath(`/producten/${product.id}`)
}
