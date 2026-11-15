import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Check, Plus, Search } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { ProviderListItem } from '../lib/types'
import './Providers.css'

type ConsentFilter = 'all' | 'given' | 'not-given'

// "2026-09-18" -> "18 Sep 2026". A date with no time, so read it as a local day.
function formatDay(day: string) {
  return new Date(`${day}T00:00`).toLocaleDateString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Which contact details we hold, e.g. "Phone, email, website"
function contactOnFile(p: ProviderListItem) {
  const held = [
    p.contact_phone && 'phone',
    p.contact_email && 'email',
    p.website && 'website',
  ].filter(Boolean) as string[]
  if (held.length === 0) return 'None'
  const text = held.join(', ')
  return text[0].toUpperCase() + text.slice(1)
}

// SCRUM-129 fix 09 (hi-fi 12): the coordinator's list of providers
export default function ProviderList() {
  const [providers, setProviders] = useState<ProviderListItem[] | null>(null)
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState('')
  const [consent, setConsent] = useState<ConsentFilter>('all')

  useEffect(() => {
    api<ProviderListItem[]>('/providers')
      .then(setProviders)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Can't reach the server. Try again."),
      )
  }, [])

  const all = providers ?? []
  const givenCount = all.filter((p) => p.consent_given).length

  // The list is short, so it filters as you type, with no Search button
  const q = query.trim().toLowerCase()
  const shown = all.filter(
    (p) =>
      (!q || p.name.toLowerCase().includes(q)) &&
      (consent === 'all' || p.consent_given === (consent === 'given')),
  )
  const filtering = q !== '' || consent !== 'all'

  return (
    <section>
      <div className="page-header providers-header">
        <div>
          <h1 className="page-title">Providers</h1>
          <p className="providers-mi" lang="mi">
            Ngā kaiwhakarato
          </p>
          <p className="providers-intro">
            The groups that run activities in the catalogue, and whether they've agreed to be
            listed.
          </p>
        </div>
        <Link to="/providers/new" className="button button-primary">
          <Plus size={18} aria-hidden="true" />
          Add provider
        </Link>
      </div>

      <div className="providers-toolbar">
        <div className="providers-search">
          <label htmlFor="provider-search">Search providers</label>
          <div className="providers-search-box">
            <Search size={18} aria-hidden="true" />
            <input
              id="provider-search"
              type="search"
              placeholder="Provider name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="providers-consent">
          <label htmlFor="provider-consent">Listing consent</label>
          <select
            id="provider-consent"
            value={consent}
            onChange={(e) => setConsent(e.target.value as ConsentFilter)}
          >
            <option value="all">All ({all.length})</option>
            <option value="given">Given ({givenCount})</option>
            <option value="not-given">Not given ({all.length - givenCount})</option>
          </select>
        </div>
      </div>

      {/* Screen readers hear how many match while filtering */}
      <p role="status" className="visually-hidden">
        {filtering ? `${shown.length} ${shown.length === 1 ? 'provider' : 'providers'} shown` : ''}
      </p>

      {error && <p role="alert">{error}</p>}
      {!error && providers === null && <p role="status">Loading providers…</p>}
      {providers?.length === 0 && <p>No providers yet. Add your first one.</p>}
      {all.length > 0 && shown.length === 0 && (
        <p className="providers-empty">No providers match these filters.</p>
      )}

      {shown.length > 0 && (
        <div
          className="table-scroll providers-card"
          tabIndex={0}
          role="region"
          aria-label="Providers"
        >
          <table className="providers-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Contact on file</th>
                <th scope="col">Activities</th>
                <th scope="col">Listing consent</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.provider_id}>
                  <th scope="row">{p.name}</th>
                  <td>{contactOnFile(p)}</td>
                  <td>{p.activity_count}</td>
                  <td>
                    {p.consent_given && p.consent_date ? (
                      <span className="consent-pill consent-given">
                        <Check size={14} aria-hidden="true" />
                        Given {formatDay(p.consent_date)}
                      </span>
                    ) : (
                      <span className="consent-pill consent-missing">Not given</span>
                    )}
                  </td>
                  <td className="providers-edit">
                    <Link to={`/providers/${p.provider_id}`} aria-label={`Edit ${p.name}`}>
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="providers-note">
        Contact details are stored on the provider, not on each activity.
      </p>
    </section>
  )
}
