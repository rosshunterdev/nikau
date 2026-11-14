import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Mail, Phone } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { activityMeta } from '../lib/activityFormat'
import { announceLeadsChanged, formatDate } from '../lib/leads'
import type { LeadWithClient } from '../lib/types'
import './SavedLeads.css'

type ClientGroup = { clientId: string; clientName: string; leads: LeadWithClient[] }

// The API sends leads newest first. Group them by client, keeping that order,
// so the client with the most recent lead comes first.
function byClient(leads: LeadWithClient[]): ClientGroup[] {
  const groups = new Map<string, ClientGroup>()
  for (const lead of leads) {
    const group = groups.get(lead.client_id) ?? {
      clientId: lead.client_id,
      clientName: lead.client_name,
      leads: [],
    }
    group.leads.push(lead)
    groups.set(lead.client_id, group)
  }
  return [...groups.values()]
}

// "Sam R." → "SR"
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// SCRUM-129 fix 05 (hi-fi 08): every saved lead you can see, grouped by client, with
// what to ask, how to contact the provider, and Remove.
export default function SavedLeads() {
  const [leads, setLeads] = useState<LeadWithClient[] | null>(null) // null = loading
  const [error, setError] = useState<string>()
  const [clientId, setClientId] = useState('') // '' = all clients
  const [removing, setRemoving] = useState<string>() // lead_id being removed
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    api<LeadWithClient[]>('/leads')
      .then(setLeads)
      .catch(() => setError("Can't load saved leads. Try again."))
  }, [])

  const allGroups = leads ? byClient(leads) : []
  const groups = clientId ? allGroups.filter((g) => g.clientId === clientId) : allGroups

  async function remove(lead: LeadWithClient) {
    const name = lead.activity_name ?? 'this lead'
    // Leads are a snapshot: once removed, the AI's explanation is gone
    if (!window.confirm(`Remove ${name} from ${lead.client_name}'s saved leads?`)) return

    setRemoving(lead.lead_id)
    setError(undefined)
    setMessage(undefined)
    try {
      await api<void>(`/clients/${lead.client_id}/leads/${lead.lead_id}`, { method: 'DELETE' })
      const left = (leads ?? []).filter((l) => l.lead_id !== lead.lead_id)
      setLeads(left)
      // The filtered client has no leads left: go back to all clients
      if (clientId && !left.some((l) => l.client_id === clientId)) setClientId('')
      setMessage(`Removed ${name} from ${lead.client_name}'s saved leads.`)
      announceLeadsChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the server. Try again.")
    } finally {
      setRemoving(undefined)
    }
  }

  function removeButton(lead: LeadWithClient) {
    const name = lead.activity_name ?? 'activity no longer listed'
    return (
      <button
        type="button"
        className="button-outline lead-remove"
        onClick={() => remove(lead)}
        disabled={removing === lead.lead_id}
        aria-label={`Remove ${name} for ${lead.client_name}`}
      >
        {removing === lead.lead_id ? 'Removing…' : 'Remove lead'}
      </button>
    )
  }

  return (
    <section>
      <div className="leads-header">
        <div>
          <h1>Saved leads</h1>
          <p className="leads-intro">Activities saved to follow up, grouped by client.</p>
        </div>
        {allGroups.length > 1 && (
          <div className="leads-filter">
            <label htmlFor="leads-client">Client</label>
            <select
              id="leads-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">All clients ({plural(leads?.length ?? 0, 'lead')})</option>
              {allGroups.map((g) => (
                <option key={g.clientId} value={g.clientId}>
                  {g.clientName} ({plural(g.leads.length, 'lead')})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Always present, so screen readers hear "Removed …" */}
      <p role="status" className={message ? 'leads-message' : 'visually-hidden'}>
        {message}
      </p>
      {error && <p role="alert">{error}</p>}

      {leads === null ? (
        !error && <p>Loading saved leads…</p>
      ) : leads.length === 0 ? (
        <p className="leads-empty">
          No saved leads yet. Find activities for a client, or open the catalogue from a client,
          to save activities for them.
        </p>
      ) : (
        groups.map((group) => (
          <section
            key={group.clientId}
            aria-labelledby={`leads-${group.clientId}`}
            className="leads-group"
          >
            <div className="leads-group-head">
              <span className="leads-avatar" aria-hidden="true">
                {initials(group.clientName)}
              </span>
              <h2 id={`leads-${group.clientId}`}>
                <Link to={`/clients/${group.clientId}`}>{group.clientName}</Link>
              </h2>
              <span className="leads-count">{plural(group.leads.length, 'lead')}</span>
            </div>

            <ul className="leads-list">
              {group.leads.map((lead) => {
                const saved = `Saved by ${lead.saved_by_name ?? 'unknown'}, ${formatDate(lead.saved_on)}`

                // Activity hidden or archived: one grey line, so it can still be cleared
                if (!lead.activity_name) {
                  return (
                    <li key={lead.lead_id} className="lead-card lead-card-gone">
                      <div>
                        <h3>Activity no longer listed</h3>
                        <p>{saved}.</p>
                      </div>
                      {removeButton(lead)}
                    </li>
                  )
                }

                const meta = activityMeta(lead)
                const fromAi = lead.source === 'ai_match'
                return (
                  <li key={lead.lead_id} className="lead-card">
                    <div className="lead-card-about">
                      <h3>
                        <Link to={`/activities/${lead.activity_id}`}>{lead.activity_name}</Link>
                      </h3>
                      {meta && <p className="lead-card-meta">{meta}</p>}
                      <p className="lead-card-meta">{saved}</p>
                      <span className={fromAi ? 'lead-tag lead-tag-ai' : 'lead-tag'}>
                        {fromAi ? 'From suggestions' : 'From the catalogue'}
                      </span>
                    </div>

                    <div className="lead-card-ask">
                      {fromAi ? (
                        <>
                          <h4>
                            Ask the provider about{' '}
                            <span className="lead-card-ai">· AI-written</span>
                          </h4>
                          {lead.why_ask.length > 0 ? (
                            <ul>
                              {lead.why_ask.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="lead-card-note">No questions suggested.</p>
                          )}
                          {lead.why_doesnt_cover.length > 0 && (
                            <>
                              <h4>Doesn't cover</h4>
                              <ul>
                                {lead.why_doesnt_cover.map((item, i) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </>
                          )}
                          {/* The AI's reasons for suggesting it, on request */}
                          {lead.why_fits.length > 0 && (
                            <details className="lead-card-why">
                              <summary>
                                Why it fits
                                <span className="visually-hidden"> for {lead.activity_name}</span>
                              </summary>
                              <ul>
                                {lead.why_fits.map((item, i) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </>
                      ) : (
                        <p className="lead-card-note">
                          Saved from the catalogue. Check the listing for details.
                        </p>
                      )}
                    </div>

                    <div className="lead-card-actions">
                      {lead.provider_name && (
                        <p className="lead-card-provider">{lead.provider_name}</p>
                      )}
                      {lead.provider_phone || lead.provider_email ? (
                        <ul className="lead-contact" aria-label={`Contact ${lead.provider_name ?? 'the provider'}`}>
                          {lead.provider_phone && (
                            <li>
                              <Phone size={18} aria-hidden="true" />
                              <a href={`tel:${lead.provider_phone.replace(/\s/g, '')}`}>
                                {lead.provider_phone}
                              </a>
                            </li>
                          )}
                          {lead.provider_email && (
                            <li>
                              <Mail size={18} aria-hidden="true" />
                              <a href={`mailto:${lead.provider_email}`}>{lead.provider_email}</a>
                            </li>
                          )}
                        </ul>
                      ) : (
                        <p className="lead-card-note">Contact details not available</p>
                      )}
                      {removeButton(lead)}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </section>
  )
}
