import { z } from 'zod'
import { AlertSeverity, ImportFormat, MatchStatus, ReportStatus, UserRole } from '@/generated/prisma/client'

export const productSchema = z.object({
  articleNumber: z.string().min(1),
  ean: z.string().optional().nullable(),
  gtin: z.string().optional().nullable(),
  name: z.string().min(1),
  productGroupId: z.string().min(1),
  ownPrice: z.coerce.number().nonnegative().optional().nullable(),
  vatIncluded: z.coerce.boolean().default(true),
  packagingUnit: z.string().optional().nullable(),
  packagingQty: z.coerce.number().int().positive().default(1),
  currency: z.string().default('EUR'),
  stockStatus: z.string().optional().nullable(),
  isActive: z.coerce.boolean().default(true),
  notes: z.string().optional().nullable(),
})

export const competitorSchema = z.object({
  name: z.string().min(1),
  website: z.string().url(),
  countryId: z.string().min(1),
  isActive: z.coerce.boolean().default(true),
  checkFrequencyHours: z.coerce.number().int().positive().default(24),
})

export const alertPatchSchema = z.object({
  id: z.string().min(1),
  isRead: z.boolean().default(true),
})

export const reportSchema = z.object({
  title: z.string().min(1),
  weekStart: z.coerce.date(),
  weekEnd: z.coerce.date(),
  status: z.nativeEnum(ReportStatus).default(ReportStatus.PENDING),
})

export const importColumnMappingSchema = z.object({
  articleNumber: z.string().optional(),
  ean: z.string().optional(),
  productName: z.string().optional(),
  productGroup: z.string().optional(),
  country: z.string().optional(),
  webshop: z.string().optional(),
  engelsUrl: z.string().optional(),
  ownPrice: z.string().optional(),
  ownStock: z.string().optional(),
  competitorName: z.string().optional(),
  competitorUrl: z.string().optional(),
  competitorPrice: z.string().optional(),
  currency: z.string().optional(),
  competitorStock: z.string().optional(),
  lastChecked: z.string().optional(),
  packagingUnit: z.string().optional(),
})

export const importRowSchema = z.record(z.string(), z.string())

export const importPayloadSchema = z.object({
  filename: z.string().min(1),
  format: z.nativeEnum(ImportFormat),
  mapping: importColumnMappingSchema,
  rows: z.array(importRowSchema).min(1),
})

export const matchActionSchema = z.object({
  matchId: z.string().min(1),
  nextStatus: z.nativeEnum(MatchStatus),
})

export const countrySchema = z.object({
  id: z.string().optional(),
  code: z.string().min(2).max(2).transform((value) => value.toUpperCase()),
  name: z.string().min(1),
  vatRate: z.coerce.number().min(0).max(100),
  currency: z.string().min(3).max(3).transform((value) => value.toUpperCase()),
  isActive: z.coerce.boolean().default(true),
})

export const productGroupSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  isActive: z.coerce.boolean().default(true),
})

export const webshopSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  url: z.string().url(),
  countryId: z.string().min(1),
  competitorId: z.string().optional().nullable(),
  isActive: z.coerce.boolean().default(true),
})

export const userSchema = z.object({
  id: z.string().optional(),
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(12),
  role: z.nativeEnum(UserRole),
})

export const alertFilterSchema = z.object({
  severity: z.nativeEnum(AlertSeverity).optional(),
  type: z.string().optional(),
  productId: z.string().optional(),
})
