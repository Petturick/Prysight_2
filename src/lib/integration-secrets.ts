import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const VERSION = 'v1'

function encryptionKey() {
  const material = process.env.INTEGRATION_ENCRYPTION_KEY?.trim() || process.env.NEXTAUTH_SECRET?.trim()
  if (!material || material.length < 16) {
    throw new Error('Integratiebeveiliging ontbreekt. Stel INTEGRATION_ENCRYPTION_KEY of een geldige NEXTAUTH_SECRET in.')
  }
  return createHash('sha256').update(material).digest()
}

export function encryptIntegrationSecret(value: string) {
  const secret = value.trim()
  if (!secret) throw new Error('Integratiecredential ontbreekt.')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), authTag.toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptIntegrationSecret(value: string) {
  const [version, ivValue, tagValue, payloadValue] = value.split('.')
  if (version !== VERSION || !ivValue || !tagValue || !payloadValue) {
    throw new Error('Opgeslagen integratiecredential heeft een ongeldig formaat.')
  }
  const iv = Buffer.from(ivValue, 'base64url')
  const authTag = Buffer.from(tagValue, 'base64url')
  const payload = Buffer.from(payloadValue, 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8')
}
