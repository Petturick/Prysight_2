import assert from 'node:assert/strict'
import test from 'node:test'
import { isUnnamedGroup, productGroupLabel, suggestProductGroup } from './product-groups'

test('numeric feed codes are never exposed as descriptive labels', () => {
  assert.equal(isUnnamedGroup('102'), true)
  assert.equal(productGroupLabel({ name: '102' }), 'Nog niet ingedeeld')
  assert.equal(productGroupLabel({ name: '102', description: 'Automatisch aangemaakt vanuit productfeed.' }), 'Nog niet ingedeeld')
  assert.equal(productGroupLabel({ name: '102', description: 'Inklapbare bakken' }), 'Inklapbare bakken')
  assert.equal(productGroupLabel({ name: 'Palletboxen' }), 'Palletboxen')
})

test('suggests only a distinct existing category from the product name', () => {
  const groups = [{ name: 'Inklapbare bakken' }, { name: 'Palletboxen' }, { name: '103' }]
  assert.equal(suggestProductGroup('Inklapbare bak 1187C3-7', groups), 'Inklapbare bakken')
  assert.equal(suggestProductGroup('Palletbox 1200 x 1000', groups), 'Palletboxen')
  assert.equal(suggestProductGroup('Onbekend artikel', groups), null)
  assert.equal(suggestProductGroup('Inklapbare palletbox', groups), null)
})
