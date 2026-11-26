export type NewSiteOverride = number | null | undefined

const shiftMonths = (date: string, months: number) => {
  const value = new Date(`${date}T00:00:00Z`)
  const day = value.getUTCDate()
  value.setUTCDate(1)
  value.setUTCMonth(value.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate()
  value.setUTCDate(Math.min(day, lastDay))
  return value.toISOString().slice(0, 10)
}

export const isWebsiteNew = (override: NewSiteOverride, registrarDate: unknown, today: string) => {
  if (override === 1) return true
  if (override === 0 || typeof registrarDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(registrarDate)) return false
  const registered = new Date(`${registrarDate}T00:00:00Z`)
  if (!Number.isFinite(registered.getTime()) || registered.toISOString().slice(0, 10) !== registrarDate) return false
  return registrarDate >= shiftMonths(today, -3) && registrarDate <= today
}
