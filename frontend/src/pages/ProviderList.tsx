import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { Provider } from '../lib/types'

// Show a date like "18 Oct 2026"
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function ProviderList() {
  const [providers, setProviders] = useState<Provider[] | null>(null)
  const [error, setError] = useState<string>()

  useEffect(() => {
    api<Provider[]>('/providers')
      .then(setProviders)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Can't reach the server. Try again."),
      )
  }, [])

  return (
    <section>
      <div className="page-header">
        <h1 className="page-title">Providers</h1>
        <Link to="/providers/new" className="button button-outline">
          <Plus size={18} aria-hidden="true" />
          Add provider
        </Link>
      </div>

      {error && <p role="alert">{error}</p>}
      {!error && providers === null && <p role="status">Loading providers…</p>}
      {providers?.length === 0 && <p>No providers yet. Add your first one.</p>}

      {providers && providers.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Consent</th>
              <th scope="col">Contact</th>
              <th scope="col"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.provider_id}>
                <td>{p.name}</td>
                <td>
                  {p.consent_given && p.consent_date
                    ? `Given ${formatDate(p.consent_date)}`
                    : 'Not yet'}
                </td>
                <td>{p.contact_email ?? p.contact_phone ?? '—'}</td>
                <td>
                  <Link to={`/providers/${p.provider_id}`} aria-label={`Edit ${p.name}`}>
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
