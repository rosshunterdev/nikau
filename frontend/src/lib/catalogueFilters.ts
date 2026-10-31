// Catalogue search filters (SCRUM-86).
// The page address holds the filters, using the same names as GET /activities/search,
// e.g. /activities?max_physical_demand=low&available=sat-morning
// So a client's profile can link straight to a pre-filled search, and back/refresh keep it.

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
