import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'
import { formatDate, SOURCE_LABEL } from '../lib/leads'
import type { LeadWithClient } from '../lib/types'

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

// Every saved lead you can see, grouped by client.
// The full AI explanation and Remove are on each client's profile.
export default function SavedLeads() {
  const [groups, setGroups] = useState<ClientGroup[] | null>(null) // null = loading
  const [error, setError] = useState<string>()

  useEffect(() => {
    api<LeadWithClient[]>('/leads')
      .then((leads) => setGroups(byClient(leads)))
      .catch(() => setError("Can't load saved leads. Try again."))
  }, [])

  return (
    <section>
      <h1>Saved leads</h1>

      {error && <p role="alert">{error}</p>}

      {groups === null ? (
        !error && <p>Loading saved leads…</p>
      ) : groups.length === 0 ? (
        <p>No saved leads yet. Open the catalogue from a client to save activities for them.</p>
      ) : (
        groups.map((group) => (
          <section key={group.clientId} aria-labelledby={`leads-${group.clientId}`}>
            <h2 id={`leads-${group.clientId}`}>{group.clientName}</h2>
            <Link to={`/clients/${group.clientId}`}>
              Open {group.clientName}'s profile
            </Link>

            <ul>
              {group.leads.map((lead) => (
                <li key={lead.lead_id}>
                  <h3>{lead.activity_name ?? 'No longer listed'}</h3>
                  {lead.provider_name && <p>{lead.provider_name}</p>}
                  <p>
                    {SOURCE_LABEL[lead.source]} · saved by {lead.saved_by_name ?? 'unknown'} on{' '}
                    {formatDate(lead.saved_on)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  )
}
