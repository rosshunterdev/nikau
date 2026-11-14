import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../lib/api'
import { formatDate, SOURCE_LABEL } from '../lib/leads'
import type { Lead } from '../lib/types'
import Why from './Why'

type Props = {
  clientId: string
  clientName: string
}

// A client's saved leads on their profile (hi-fi 03): one compact row each with
// "Ask about", and a Details toggle with the AI's full reasons and Remove.
export default function ClientLeads({ clientId, clientName }: Props) {
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
    <section aria-labelledby="saved-leads-heading" className="profile-leads">
      <div className="profile-leads-head">
        <h2 id="saved-leads-heading">
          Saved leads for {clientName}
          {leads && leads.length > 0 && ` (${leads.length})`}
        </h2>
        <Link to="/leads">View all saved leads</Link>
      </div>

      {error && <p role="alert">{error}</p>}

      {leads === null ? (
        !error && <p>Loading saved leads…</p>
      ) : leads.length === 0 ? (
        <p className="profile-empty">No saved leads yet.</p>
      ) : (
        <ul className="lead-rows">
          {leads.map((lead) => {
            const name = lead.activity_name ?? 'No longer listed'
            return (
              <li key={lead.lead_id} className="lead-row">
                <div className="lead-row-main">
                  <div>
                    <h3>
                      {lead.activity_name ? (
                        <Link to={`/activities/${lead.activity_id}`}>{lead.activity_name}</Link>
                      ) : (
                        name
                      )}
                    </h3>
                    <p className="lead-row-meta">
                      {lead.provider_name && `${lead.provider_name} · `}saved{' '}
                      {formatDate(lead.saved_on)}
                    </p>
                  </div>
                  {lead.why_ask.length > 0 && (
                    <p className="lead-row-ask">
                      <strong>Ask about:</strong> {lead.why_ask.join('; ')}
                    </p>
                  )}
                </div>

                {/* The AI's full reasons and Remove, tucked away until needed */}
                <details className="lead-row-details">
                  <summary>
                    Details<span className="visually-hidden"> for {name}</span>
                  </summary>
                  {lead.activity_name === null && (
                    <p>This activity isn't in the catalogue any more, so its details are hidden.</p>
                  )}
                  <p className="lead-row-meta">
                    {SOURCE_LABEL[lead.source]} · saved by {lead.saved_by_name ?? 'unknown'}
                  </p>
                  <Why title="Why it fits" items={lead.why_fits} />
                  <Why title="What it doesn't cover" items={lead.why_doesnt_cover} />
                  <Why title="Ask the provider" items={lead.why_ask} />
                  <button
                    type="button"
                    onClick={() => remove(lead)}
                    disabled={removing === lead.lead_id}
                    aria-label={`Remove ${name}`}
                  >
                    {removing === lead.lead_id ? 'Removing…' : 'Remove'}
                  </button>
                </details>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
