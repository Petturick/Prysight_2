export const dynamic = 'force-dynamic'

import { createDecipheriv } from 'node:crypto'
import { inflateSync } from 'node:zlib'
import { NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { saveProductOnboardingFields } from '@/lib/product-onboarding-fields'
import { prisma } from '@/lib/prisma'
import { isUnnamedGroup } from '@/lib/product-groups'
import { z } from 'zod'

const productSchema = z.object({
  articleNumber: z.string().min(1),
  name: z.string().min(1),
  ean: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  group: z.string().min(1),
  ownPrice: z.number().nullable().optional(),
  costPrice: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
})

const competitorSchema = z.object({
  name: z.string().min(1),
  website: z.string().url(),
  country: z.enum(['NL', 'BE']),
})

const payloadSchema = z.object({
  products: z.array(productSchema).max(50).default([]),
  competitors: z.array(competitorSchema).max(50).default([]),
})

function decryptPayload(encoded: string, secret: string) {
  const key = Buffer.from(secret, 'hex')
  if (key.length !== 32) throw new Error('Bootstrap key has an invalid length.')
  const buffer = Buffer.from(encoded, 'base64url')
  if (buffer.length < 29) throw new Error('Encrypted payload is incomplete.')
  const iv = buffer.subarray(0, 12)
  const tag = buffer.subarray(12, 28)
  const ciphertext = buffer.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(inflateSync(compressed).toString('utf8')) as unknown
}

export async function GET(request: Request) {
  const secret = process.env.PRYSIGHT_BOOTSTRAP_TOKEN
  if (!secret) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const url = new URL(request.url)
    const encrypted = url.searchParams.get('payload')
    if (!encrypted) return NextResponse.json({ error: 'Payload ontbreekt.' }, { status: 400 })
    const parsed = payloadSchema.parse(decryptPayload(encrypted, secret))
    const companyId = 'cmp_engels_group'
    const countries = await prisma.country.findMany({ where: { code: { in: ['NL', 'BE'] } } })
    const countryByCode = new Map(countries.map((country) => [country.code, country]))
    const nl = countryByCode.get('NL')
    if (!nl) throw new Error('Nederlandse markt ontbreekt.')

    let competitorCount = 0
    for (const competitor of parsed.competitors) {
      const country = countryByCode.get(competitor.country)
      if (!country) continue
      await prisma.competitor.upsert({
        where: { companyId_name_countryId: { companyId, name: competitor.name, countryId: country.id } },
        update: { website: competitor.website, isActive: true },
        create: { companyId, name: competitor.name, website: competitor.website, countryId: country.id, isActive: true, checkFrequencyHours: 24 },
      })
      competitorCount += 1
    }

    const groupNames = [...new Set(parsed.products.map((product) => isUnnamedGroup(product.group) ? 'Onbekend' : product.group))]
    const groups = await Promise.all(groupNames.map((name) => prisma.productGroup.upsert({
      where: { companyId_name: { companyId, name } },
      update: { isActive: true },
      create: { companyId, name, description: 'Aangemaakt vanuit Prisync bulkimport 2026-09-14', isActive: true },
    })))
    const groupByName = new Map(groups.map((group) => [group.name, group]))

    let productCount = 0
    let marketCount = 0
    for (const productInput of parsed.products) {
      const group = groupByName.get(isUnnamedGroup(productInput.group) ? 'Onbekend' : productInput.group)
      if (!group) continue
      const ownPrice = productInput.ownPrice == null ? null : new Prisma.Decimal(productInput.ownPrice)
      const product = await prisma.product.upsert({
        where: { companyId_articleNumber: { companyId, articleNumber: productInput.articleNumber } },
        update: {
          name: productInput.name,
          ean: productInput.ean || undefined,
          productGroupId: group.id,
          ownPrice: ownPrice ?? undefined,
          packagingUnit: 'stuks',
          packagingQty: 1,
          currency: 'EUR',
          notes: productInput.notes || undefined,
          isActive: true,
        },
        create: {
          companyId,
          articleNumber: productInput.articleNumber,
          ean: productInput.ean || null,
          name: productInput.name,
          productGroupId: group.id,
          ownPrice,
          packagingUnit: 'stuks',
          packagingQty: 1,
          currency: 'EUR',
          stockStatus: 'Onbekend',
          notes: productInput.notes || null,
          isActive: true,
        },
      })
      await saveProductOnboardingFields(companyId, product.id, {
        mpn: productInput.articleNumber,
        brand: productInput.brand || 'Engels',
        costPrice: productInput.costPrice && productInput.costPrice > 0 ? productInput.costPrice : undefined,
      })
      await prisma.productMarket.upsert({
        where: { companyId_productId_countryId: { companyId, productId: product.id, countryId: nl.id } },
        update: { ownPrice: ownPrice ?? undefined, currency: 'EUR', isActive: true },
        create: { companyId, productId: product.id, countryId: nl.id, ownPrice, currency: 'EUR', stockStatus: 'Onbekend', isActive: true },
      })
      productCount += 1
      marketCount += 1
    }

    return NextResponse.json({ ok: true, products: productCount, markets: marketCount, competitors: competitorCount, groups: groupNames.length })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Bootstrap failed.' }, { status: 400 })
  }
}
