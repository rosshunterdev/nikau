// Shapes returned by the Core API (match app/schemas/clients.py)

export type ClientSummary = {
  client_id: string
  preferred_name: string
  suburb_name: string | null
  updated_at: string
}