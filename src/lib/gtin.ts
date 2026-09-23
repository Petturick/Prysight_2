/** GS1 GTIN-8, GTIN-12, GTIN-13 and GTIN-14 validation, preserving leading zeroes. */
export function normalizeGtin(value: string | null | undefined): string {
  return String(value ?? '').replace(/[\s-]/g, '').trim()
}

export function validGtin(value: string | null | undefined): boolean {
  const code = normalizeGtin(value)
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false
  let sum = 0
  for (let i = code.length - 2, multiplier = 3; i >= 0; i -= 1, multiplier = multiplier === 3 ? 1 : 3) {
    sum += Number(code[i]) * multiplier
  }
  return (10 - sum % 10) % 10 === Number(code[code.length - 1])
}
