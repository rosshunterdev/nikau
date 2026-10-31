// Shapes returned by the Core API (match app/schemas/clients.py)

export type ClientSummary = {
  client_id: string
  preferred_name: string
  suburb_name: string | null
  updated_at: string
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
  interests: string[]
  availability: { day: Day; slot: Slot }[]
  updated_at: string
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
