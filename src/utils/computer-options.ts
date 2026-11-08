export const defaultComputerNames = ['Mac Mini YC', 'Macbook Pro'] as const

export const sortComputerNames = (names: Iterable<string | null | undefined>) => [...new Set([
  ...defaultComputerNames,
  ...names
].map(name => name?.trim()).filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' }))
