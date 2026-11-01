// Catalogue search filters (SCRUM-86).
// The page address holds the filters, using the same names as GET /activities/search,
// e.g. /activities?max_physical_demand=low&available=sat-morning
// So a client's profile can link straight to a pre-filled search, and back/refresh keep it.

import type { ClientDetail } from './types'

// Every filter the search API accepts
export const FILTER_KEYS = [
  'q',
  'suburb_id',
  'tags',
  'max_physical_demand',
  'max_sensory_load',
  'sensory_hard_limit',
  'needs_step_free',
  'max_cost',
  'birth_year',
  'transport',
  'support_needed',
  'available',
] as const

// Only the filter params from the address, in the API's format
export function filtersOnly(params: URLSearchParams) {
  const out = new URLSearchParams()
  for (const key of FILTER_KEYS) {
    for (const value of params.getAll(key)) {
      if (value !== '') out.append(key, value)
    }
  }
  return out
}

export function hasFilters(params: URLSearchParams) {
  return filtersOnly(params).toString() !== ''
}

// A client's saved needs as catalogue filters, so the catalogue opens pre-filled.
// Only the pre-filter's rules are filled in, so the catalogue shows the same activities
// AI matching would consider. Interests and suburb are left out: they're signals, not
// filters (SCRUM-50 v0.3). Staff can still tick them in the panel.
export function clientFilters(c: ClientDetail) {
  const params = new URLSearchParams()
  const add = (key: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && value !== '') params.append(key, String(value))
  }

  add('max_physical_demand', c.max_physical_demand)
  add('max_sensory_load', c.max_sensory_load)
  if (c.sensory_hard_limit) add('sensory_hard_limit', 'true')
  if (c.needs_step_free) add('needs_step_free', 'true')
  add('support_needed', c.support_needed)
  add('birth_year', c.birth_year)
  add('max_cost', c.max_cost)
  for (const t of c.transport ?? []) add('transport', t)
  for (const a of c.availability ?? []) add('available', `${a.day}-${a.slot}`)

  return params
}
