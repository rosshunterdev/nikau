// Shapes returned by the Core API (match app/schemas/clients.py)

export type ClientSummary = {
  client_id: string
  preferred_name: string
  suburb_name: string | null
  updated_at: string
  goal_count: number
}

export type Level = 'low' | 'medium' | 'high'
export type SupportNeeded = 'own' | 'worker_present' | 'one_to_one'
export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type Slot = 'morning' | 'afternoon' | 'evening'

export type Suburb = { suburb_id: string; name: string; territorial_authority: string }
export type Tag = { tag_id: string; name: string }

export type ClientDetail = {
  client_id: string
  preferred_name: string
  suburb_id: string | null
  birth_year: number | null
  support_needed: SupportNeeded
  max_physical_demand: Level
  needs_step_free: boolean
  max_sensory_load: Level
  sensory_hard_limit: boolean
  transport: string[]
  max_cost: number | null
  goals: string[]
  participation_notes: string | null
  physical_notes: string | null
  sensory_notes: string | null
  travel_range_minutes: number | null
  interests: string[]
  availability: { day: Day; slot: Slot }[]
  updated_at: string
  assigned_to: string[]
}

// Providers and activities (match app/schemas/providers.py and activities.py)

export type Provider = {
  provider_id: string
  name: string
  contact_email: string | null
  contact_phone: string | null
  website: string | null
  consent_given: boolean
  consent_date: string | null
  created_at: string
}

export type ActivitySummary = {
  activity_id: string
  name: string
  provider_name: string
  suburb_name: string | null
  cost_per_session: number | null
  consent_given: boolean
  updated_at: string
}

export type ActivitySession = { day: Day; start_time: string; end_time: string }

export type ActivityDetail = {
  activity_id: string
  provider_id: string
  name: string
  description: string | null
  suburb_id: string | null
  physical_demand: Level | null
  sensory_load: Level | null
  step_free_access: boolean | null
  cost_per_session: number | null
  min_age: number | null
  max_age: number | null
  transport_options: string[]
  support_worker_policy: string | null
  checked_at: string | null
  checked_by: string | null
  tags: string[]
  sessions: ActivitySession[]
  updated_at: string
}

// Saved leads (match app/schemas/leads.py)

export type LeadSource = 'ai_match' | 'manual_search'

export type Lead = {
  lead_id: string
  client_id: string
  activity_id: string
  activity_name: string | null // null = no longer listed
  provider_name: string | null
  source: LeadSource
  why_fits: string[]
  why_doesnt_cover: string[]
  why_ask: string[]
  match_request_id: string | null
  saved_by_name: string | null
  saved_on: string
}

export type LeadWithClient = Lead & { client_name: string }

// Find activities (match app/schemas/matching.py, SCRUM-87)

export type MatchResult =
  | 'success'
  | 'no_good_fit'
  | 'no_candidates'
  | 'timeout'
  | 'error'
  | 'invalid_output'

export type MatchLead = {
  activity_id: string
  activity_name: string
  rank: number
  why_fits: string[]
  why_doesnt_cover: string[]
  why_ask: string[]
}

export type FindActivitiesResponse = {
  request_id: string
  result: MatchResult
  message: string | null // set when the screen should fall back to the catalogue
  leads: MatchLead[]
}

export type MatchingLogEntry = {
  request_id: string
  requested_at: string
  result: MatchResult
  fallback_shown: boolean
  called_as: 'http' | 'direct' | null
  response_ms: number | null
  candidate_count: number | null
  leads_shown: number | null
  model_ms: number | null
  dropped_count: number | null
  requested_by_name: string | null
}
