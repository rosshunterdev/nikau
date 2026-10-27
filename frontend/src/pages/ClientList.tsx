import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { ClientSummary } from '../lib/types'
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

  // Load the clients once when the page opens. RLS decides who you see.
  useEffect(() => {
    api<ClientSummary[]>('/clients')
      .then(setClients)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Can't reach the server. Try again."),
      )
  }, [])

  return (
    <section>
      <div className="page-header">
        <h1 className="page-title">
          <span lang="mi">Kiritaki</span>
          <span className="page-title-en">Clients</span>
        </h1>
        <Link to="/clients/new" className="button button-outline">
          <Plus size={18} aria-hidden="true" />
          Add client
        </Link>
      </div>

      {error && <p role="alert">{error}</p>}
      {!error && clients === null && <p role="status">Loading clients…</p>}
      {clients?.length === 0 && <p>No clients yet. Add your first one.</p>}

      {clients && clients.length > 0 && (
        <ul className="client-cards">
          {clients.map((c) => (
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

              <p className="client-meta">Updated {formatDate(c.updated_at)}</p>

              <Link
                to={`/clients/${c.client_id}`}
                className="button button-soft"
                aria-label={`Open profile for ${c.preferred_name}`}
              >
                View profile
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}