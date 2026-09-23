/** Product groups imported as bare numeric codes have no meaningful public name yet. */
export function isUnnamedGroup(name: string) {
  return !name.trim() || name.trim().toLowerCase() === 'onbekend' || /^\d+$/.test(name.trim())
}

export const MERGED_GROUP_PREFIX = '__merged_into__:'

export function mergedGroupTarget(description?: string | null) {
  return description?.startsWith(MERGED_GROUP_PREFIX) ? description.slice(MERGED_GROUP_PREFIX.length) : null
}

export function productGroupLabel(group: { name: string; description?: string | null }) {
  if (mergedGroupTarget(group.description)) return 'Nog niet ingedeeld'
  const name = group.name.trim()
  if (!isUnnamedGroup(name)) return name
  const label = group.description?.trim() || ''
  return label && !isUnnamedGroup(label) && !/^Automatisch aangemaakt/i.test(label) ? label : 'Nog niet ingedeeld'
}

/** Suggest only an existing, uniquely matching, named group; never fabricate a category. */
export function suggestProductGroup(productName: string, groups: Array<{ name: string; description?: string | null }>) {
  const title = productName.toLocaleLowerCase('nl-NL')
  if (!title.trim()) return null
  const matches = groups.filter((group) => {
    const label = productGroupLabel(group)
    if (label === 'Nog niet ingedeeld') return false
    return label.toLocaleLowerCase('nl-NL').split(/[^\p{L}\p{N}]+/u)
      .some((word) => {
        if (word.length < 5) return false
        const singular = word.replace(/(en|s)$/u, '')
        return title.includes(word) || (singular.length >= 5 && title.includes(singular))
      })
  })
  return matches.length === 1 ? matches[0].name : null
}
