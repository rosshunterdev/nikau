import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../lib/api'
import type { ClientSummary } from '../lib/types'

// Show a date like "18 Oct 2026"
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
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
      <h1>Clients</h1>
      <Link to="/clients/new">Add client</Link>

      {error && <p role="alert">{error}</p>}
      {!error && clients === null && <p>Loading clients…</p>}
      {clients?.length === 0 && <p>No clients yet. Add your first one.</p>}

      {clients && clients.length > 0 && (
        <ul>
          {clients.map((c) => (
            <li key={c.client_id}>
              <Link to={`/clients/${c.client_id}`}>{c.preferred_name}</Link>
              {' · '}
              {c.suburb_name ?? 'No suburb'}
              {' · '}
              Updated {formatDate(c.updated_at)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}