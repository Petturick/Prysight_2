import fs from 'node:fs'

const failures = []
const required = ['package.json', 'next.config.ts', 'netlify.toml', 'src/app/page.tsx']
for (const file of required) {
  if (!fs.existsSync(file)) failures.push(`Required file missing: ${file}`)
}

const netlify = fs.readFileSync('netlify.toml', 'utf8')
if (!netlify.includes('NEXT_DISABLE_NETLIFY_EDGE = "true"')) {
  failures.push('netlify.toml must keep Next middleware out of Netlify Edge runtime')
}
if (netlify.includes('check:database')) {
  failures.push('Netlify build must not depend on live database availability')
}

if (failures.length) {
  console.error('PrySight production contract failed:')
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}
console.log('PrySight production contract OK')
