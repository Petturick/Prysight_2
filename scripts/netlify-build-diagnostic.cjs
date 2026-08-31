const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const result = spawnSync('npm', ['run', 'build'], {
  encoding: 'utf8',
  env: process.env,
  maxBuffer: 20 * 1024 * 1024,
})

const output = `${result.stdout || ''}\n${result.stderr || ''}`.replace(/\u001b\[[0-9;]*m/g, '')
const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
const priority = lines.find((line) => /type error:|error:|module not found|failed to compile/i.test(line))
  ?? lines.find((line) => /src\/lib\/feed-ingestion\.ts/i.test(line))
  ?? lines[lines.length - 1]
  ?? 'unknown-build-error'
const fileLine = lines.find((line) => /src\/lib\/feed-ingestion\.ts/i.test(line)) ?? ''
const token = `${fileLine} ${priority}`
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 170) || 'unknown-build-error'

const publicDir = path.join(process.cwd(), 'public')
fs.mkdirSync(publicDir, { recursive: true })
for (const name of fs.readdirSync(publicDir)) {
  if (name.startsWith('diag-') && name.endsWith('.html')) fs.rmSync(path.join(publicDir, name), { force: true })
}
fs.writeFileSync(path.join(publicDir, `diag-${token}.html`), '<!doctype html><title>diagnostic</title>')
console.log(`Diagnostic token: ${token}`)
process.exit(0)
