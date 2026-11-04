import { useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { formatDate, SOURCE_LABEL } from '../lib/leads'
import type { Lead } from '../lib/types'
import Why from './Why'


// A client's saved leads, shown on their profile, with Remove
export default function ClientLeads({ clientId }: { clientId: string }) {
  const [leads, setLeads] = useState<Lead[] | null>(null) // null = still loading
  const [error, setError] = useState<string>()
  const [removing, setRemoving] = useState<string>() // lead_id being removed

  useEffect(() => {
    api<Lead[]>(`/clients/${clientId}/leads`)
      .then(setLeads)
      .catch(() => setError("Can't load saved leads. Try again."))
  }, [clientId])

  async function remove(lead: Lead) {
    const name = lead.activity_name ?? 'this lead'
    // Leads are a snapshot: once removed, the AI's explanation is gone
    if (!window.confirm(`Remove ${name} from saved leads?`)) return

    setRemoving(lead.lead_id)
    setError(undefined)
    try {
      await api<void>(`/clients/${clientId}/leads/${lead.lead_id}`, { method: 'DELETE' })
      setLeads((ls) => ls?.filter((l) => l.lead_id !== lead.lead_id) ?? null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the server. Try again.")
    } finally {
      setRemoving(undefined)
    }
  }

  return (
    <section aria-labelledby="saved-leads-heading">
      <h2 id="saved-leads-heading">Saved leads</h2>

      {error && <p role="alert">{error}</p>}

      {leads === null ? (
        !error && <p>Loading saved leads…</p>
      ) : leads.length === 0 ? (
        <p>No saved leads yet.</p>
      ) : (
        <ul>
          {leads.map((lead) => (
            <li key={lead.lead_id}>
              <h3>{lead.activity_name ?? 'No longer listed'}</h3>
              {lead.activity_name === null && (
                <p>This activity isn't in the catalogue any more, so its details are hidden.</p>
              )}
              {lead.provider_name && <p>{lead.provider_name}</p>}
              <p>
                {SOURCE_LABEL[lead.source]} · saved by {lead.saved_by_name ?? 'unknown'} on{' '}
                {formatDate(lead.saved_on)}
              </p>

              <Why title="Why it fits" items={lead.why_fits} />
              <Why title="What it doesn't cover" items={lead.why_doesnt_cover} />
              <Why title="Ask the provider" items={lead.why_ask} />

              <button
                type="button"
                onClick={() => remove(lead)}
                disabled={removing === lead.lead_id}
                aria-label={`Remove ${lead.activity_name ?? 'this lead'}`}
              >
                {removing === lead.lead_id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
