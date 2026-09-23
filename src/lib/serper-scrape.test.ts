import assert from 'node:assert/strict'
import test from 'node:test'
import { verifiedSerperOffer } from './serper-scrape'

const ean = '4006381333931'
test('accepts one clearly labeled price only after exact GTIN and title verification', () => {
  const result = verifiedSerperOffer(
    { title: 'Distribox kunststof distributiebak, blauw', text: `Distribox kunststof distributiebak, blauw € 25,40 incl. btw Artikel EAN ${ean}` },
    ean, 'Distribox kunststof distributiebak blauw',
  )
  assert.equal(result?.price, 25.4)
  assert.equal(result?.vatIncluded, true)
})
test('does not import unrelated products, ambiguous prices or unknown VAT', () => {
  const title = 'Distribox kunststof distributiebak, blauw'
  assert.equal(verifiedSerperOffer({ title, text: `€ 25,40 incl btw EAN 4006381333932` }, ean, 'Distribox kunststof distributiebak blauw'), null)
  assert.equal(verifiedSerperOffer({ title: 'Andere machine', text: `€ 25,40 incl btw EAN ${ean}` }, ean, 'Distribox kunststof distributiebak blauw'), null)
  assert.equal(verifiedSerperOffer({ title, text: `€ 25,40 € 27,40 incl btw EAN ${ean}` }, ean, 'Distribox kunststof distributiebak blauw'), null)
  assert.equal(verifiedSerperOffer({ title, text: `€ 25,40 EAN ${ean}` }, ean, 'Distribox kunststof distributiebak blauw'), null)
})
