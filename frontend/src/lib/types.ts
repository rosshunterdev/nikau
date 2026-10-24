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