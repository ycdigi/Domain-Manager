export const defaultComputerNames = ['Mac Mini YC', 'Macbook Pro'] as const

export const sortComputerNames = (names: Iterable<string | null | undefined>) => [...new Set([
  ...defaultComputerNames,
  ...names
].map(name => name?.trim()).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' }))

export const computerIdentity = (name: string) => {
  const full = name.trim()
  const match = full.match(/^(Mac\s*Mini|iMac|Mac\s*book(?:\s+(?:Pro|Air))?)(?:\s+(.+))?$/i)
  return { label: match?.[2] || full, prefix: match?.[2] ? match[1] : '', laptop: /mac\s*book|laptop|笔记本/i.test(full) }
}
