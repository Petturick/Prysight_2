import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

function isPrivateIpv4(address: string) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '')
  if (normalized === '::' || normalized === '::1') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (/^fe[89ab]/.test(normalized)) return true
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length)
    return isPrivateIpv4(mapped)
  }
  return false
}

function isPrivateAddress(address: string) {
  const version = isIP(address)
  if (version === 4) return isPrivateIpv4(address)
  if (version === 6) return isPrivateIpv6(address)
  return true
}

export async function assertSafeRemoteHttpUrl(rawUrl: string) {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Vul een geldige publieke product URL in.')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Alleen publieke http en https URLs zijn toegestaan.')
  }
  if (url.username || url.password) {
    throw new Error('URLs met ingebouwde inloggegevens zijn niet toegestaan.')
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname === 'metadata.google.internal'
  ) {
    throw new Error('Lokale of interne netwerkadressen zijn niet toegestaan.')
  }

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error('Lokale of interne netwerkadressen zijn niet toegestaan.')
    return url
  }

  let addresses: Array<{ address: string }>
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw new Error('De product URL kon niet veilig worden opgezocht.')
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('De product URL verwijst naar een niet publiek netwerkadres.')
  }

  return url
}

export async function safeRemoteFetch(rawUrl: string, init: RequestInit = {}, maxRedirects = 5) {
  let currentUrl = await assertSafeRemoteHttpUrl(rawUrl)

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await fetch(currentUrl, { ...init, redirect: 'manual' })
    if (![301, 302, 303, 307, 308].includes(response.status)) return response

    const location = response.headers.get('location')
    if (!location) throw new Error('De bron gaf een ongeldige redirect terug.')
    if (redirectCount === maxRedirects) throw new Error('De bron stuurt te vaak door.')

    const nextUrl = new URL(location, currentUrl)
    currentUrl = await assertSafeRemoteHttpUrl(nextUrl.toString())
  }

  throw new Error('De product URL kon niet veilig worden opgehaald.')
}
