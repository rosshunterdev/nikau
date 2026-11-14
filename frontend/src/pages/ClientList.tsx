import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Bookmark, Plus, Search } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { ClientSummary, LeadWithClient } from '../lib/types'
import './ClientList.css'


// Show a date like "18 Oct 2026"
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// "Sam Ross" -> "SR", "Sam" -> "S"
function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export default function ClientList() {
  const [clients, setClients] = useState<ClientSummary[] | null>(null)
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState('') // what's typed in Search clients
  const [leads, setLeads] = useState<LeadWithClient[]>([])

  // Clients whose name or suburb contains the search text (not case-sensitive)
  const q = query.trim().toLowerCase()
  const shown = (clients ?? []).filter(
    (c) =>
      !q ||
      c.preferred_name.toLowerCase().includes(q) ||
      (c.suburb_name ?? '').toLowerCase().includes(q),
  )
    // How many saved leads each client has, e.g. { sam's id: 2 }
  const leadCounts = new Map<string, number>()
  for (const lead of leads) {
    leadCounts.set(lead.client_id, (leadCounts.get(lead.client_id) ?? 0) + 1)
  }

  // Load the clients once when the page opens. RLS decides who you see.
  useEffect(() => {
    api<ClientSummary[]>('/clients')
      .then(setClients)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Can't reach the server. Try again."),
      )
    // Saved leads, for the counts on the cards and the banner. A nice-to-have:
    // if this fails, the clients still show, just without lead counts.
    api<LeadWithClient[]>('/leads')
      .then(setLeads)
      .catch(() => {})
  }, [])

  return (
    <section>
      <div className="page-header">
        <h1 className="page-title">
          Clients
          <span className="page-title-sub" lang="mi">
            Kiritaki
          </span>
        </h1>
      </div>

      {/* Search on the left, Add client on the right (hi-fi 02) */}
      <div className="client-toolbar">
        <div className="client-search">
          <label htmlFor="client-search">Search clients</label>
          <div className="client-search-box">
            <Search size={18} aria-hidden="true" />
            <input
              id="client-search"
              type="search"
              placeholder="Name or suburb"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <Link to="/clients/new" className="button button-outline">
          <Plus size={18} aria-hidden="true" />
          Add client
        </Link>
      </div>

      {/* Screen readers hear how many clients match while typing */}
      <p role="status" className="visually-hidden">
        {q ? `${shown.length} ${shown.length === 1 ? 'client' : 'clients'} shown` : ''}
      </p>

      {/* "3 saved leads across 2 clients" (hi-fi 02) */}
      {leads.length > 0 && (
        <div className="leads-banner">
          <Bookmark size={20} aria-hidden="true" />
          <p>
            <strong>
              {leads.length} saved {leads.length === 1 ? 'lead' : 'leads'}
            </strong>{' '}
            across {leadCounts.size} {leadCounts.size === 1 ? 'client' : 'clients'}
          </p>
          <Link to="/leads">View saved leads</Link>
        </div>
      )}

      {error && <p role="alert">{error}</p>}
      {!error && clients === null && <p role="status">Loading clients…</p>}
      {clients?.length === 0 && <p>No clients yet. Add your first one.</p>}
      {clients && clients.length > 0 && shown.length === 0 && (
        <p>No clients match "{query.trim()}".</p>
      )}

      {shown.length > 0 && (
        <ul className="client-cards">
          {shown.map((c) => (
            <li key={c.client_id} className="client-card">
              <div className="client-card-head">
                <span className="client-avatar" aria-hidden="true">
                  {initials(c.preferred_name)}
                </span>
                <div>
                  <h2 className="client-name">{c.preferred_name}</h2>
                  <p className="client-suburb">{c.suburb_name ?? 'No suburb set'}</p>
                </div>
              </div>

              <p className="client-meta">
                <span>
                  {c.goal_count} {c.goal_count === 1 ? 'goal' : 'goals'}
                </span>
                <span className={leadCounts.get(c.client_id) ? 'client-leads' : undefined}>
                  {leadCounts.get(c.client_id)
                    ? `${leadCounts.get(c.client_id)} saved ${leadCounts.get(c.client_id) === 1 ? 'lead' : 'leads'}`
                    : 'No saved leads'}
                </span>
                <span>Updated {formatDate(c.updated_at)}</span>
              </p>

              {/* SCRUM-117: two clear ways in, like the hi-fi */}
              <div className="client-card-actions">
                <Link
                  to={`/clients/${c.client_id}`}
                  className="button button-soft"
                  aria-label={`Open profile: ${c.preferred_name}`}
                >
                  Open profile
                </Link>
                <Link
                  to={`/clients/${c.client_id}/find`}
                  className="button button-primary"
                  aria-label={`Find activities for ${c.preferred_name}`}
                >
                  <Search size={18} aria-hidden="true" />
                  Find activities
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
