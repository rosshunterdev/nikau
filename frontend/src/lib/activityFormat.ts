// How an activity's time and cost are shown on cards (Find activities, Saved leads)

import { DAYS } from './options'
import type { ActivitySession } from './types'

// "10:00" → "10am", "10:30" → "10:30am", "12:00" → "12pm"
export function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h < 12 ? 'am' : 'pm'
  const hour = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, '0')}${suffix}`
}

// "Tuesdays 10am–12pm"
export function formatSession(s: ActivitySession) {
  const day = DAYS.find((d) => d.value === s.day)?.label ?? s.day
  return `${day}s ${formatTime(s.start_time)}–${formatTime(s.end_time)}`
}

// "Free", "$15", "$7.50"; null when the cost isn't known
export function formatCost(cost: number | null) {
  if (cost === null) return null
  if (cost === 0) return 'Free'
  return cost.toLocaleString('en-NZ', {
    style: 'currency',
    currency: 'NZD',
    minimumFractionDigits: Number.isInteger(cost) ? 0 : 2,
  })
}

// "Evans Bay · Tuesdays 10am–12pm · Free" (leaves out anything not known)
export function activityMeta(a: {
  suburb: string | null
  sessions: ActivitySession[]
  cost_per_session: number | null
}) {
  return [a.suburb, ...a.sessions.map(formatSession), formatCost(a.cost_per_session)]
    .filter(Boolean)
    .join(' · ')
}
