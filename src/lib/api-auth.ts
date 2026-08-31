export function verifyBearerSecret(request: Request, envName: string) {
  const expected = process.env[envName]
  if (!expected) {
    return { ok: process.env.NODE_ENV !== 'production', status: 503, message: `${envName} is niet geconfigureerd voor productie.` }
  }

  const authorization = request.headers.get('authorization')
  if (authorization !== `Bearer ${expected}`) return { ok: false, status: 401, message: 'Ongeldige of ontbrekende API sleutel.' }
  return { ok: true, status: 200, message: 'OK' }
}
