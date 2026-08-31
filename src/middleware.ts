import { NextResponse } from 'next/server'
import { edgeAuth } from '@/auth-edge'

const SAFE_CALLBACKS = new Set([
  '/dashboard',
  '/producten',
  '/concurrenten',
  '/productmatches',
  '/waarschuwingen',
  '/prijsstrategie',
  '/rapportages',
  '/feeds',
  '/import',
  '/integraties',
  '/beheer',
  '/account/password',
])

function safeCallbackPath(pathname: string) {
  if (SAFE_CALLBACKS.has(pathname)) return pathname
  for (const route of SAFE_CALLBACKS) {
    if (pathname.startsWith(`${route}/`)) return pathname
  }
  return '/dashboard'
}

export const middleware = edgeAuth((request) => {
  const pathname = request.nextUrl.pathname
  const isLoginPage = pathname === '/' || pathname === '/login'
  const isPublicPage = isLoginPage || pathname === '/reset-password'
  const isApi = pathname.startsWith('/api/')
  const isReadRequest = request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS'
  const isExternalApi =
    pathname.startsWith('/api/auth/') ||
    pathname === '/api/health' ||
    pathname === '/api/billing/stripe/webhook' ||
    pathname === '/api/feeds/publicaties/products' ||
    pathname === '/api/integraties/product-feed' ||
    pathname === '/api/integraties/syntrx' ||
    pathname === '/api/prijscontroles' ||
    pathname === '/api/rapportages'

  if (isApi && !request.auth?.user && !isExternalApi) {
    return NextResponse.json({ error: 'Log in om Prysight te gebruiken.' }, { status: 401 })
  }

  if (isApi && request.auth?.user?.role === 'READONLY' && !isReadRequest) {
    return NextResponse.json({ error: 'Uw account heeft alleen leesrechten.' }, { status: 403 })
  }

  if (isApi) return NextResponse.next()

  if (isLoginPage && request.auth?.user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (!isPublicPage && !request.auth?.user) {
    const loginUrl = new URL('/', request.url)
    loginUrl.search = ''
    loginUrl.searchParams.set('callbackUrl', safeCallbackPath(pathname))
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
