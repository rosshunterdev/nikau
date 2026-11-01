import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Plus } from 'lucide-react'
import CatalogueFilters from '../components/CatalogueFilters'
import { api, ApiError } from '../lib/api'
import { filtersOnly } from '../lib/catalogueFilters'
import type { ActivitySummary } from '../lib/types'
import { useRole } from '../lib/useRole'

// Show a cost like "$15.00", or "Free" for 0
function formatCost(cost: number | null) {
  if (cost === null) return 'Not known'
  if (cost === 0) return 'Free'
  return cost.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD' })
}

type Result = { filters: string; activities?: ActivitySummary[]; error?: string }

export default function ActivityList() {
  const role = useRole()
  const [searchParams, setSearchParams] = useSearchParams()
  // The last response, and which filters it was for
  const [result, setResult] = useState<Result>()

  // The filters in the address, e.g. "max_physical_demand=low&available=sat-morning"
  const filters = filtersOnly(searchParams).toString()
  const searching = filters !== ''

  // No filters: the whole catalogue. Filters: the search, with the pre-filter rules.
  // Runs again whenever the filters in the address change.
  useEffect(() => {
    api<ActivitySummary[]>(searching ? `/activities/search?${filters}` : '/activities')
      .then((list) => setResult({ filters, activities: list }))
      .catch((e) =>
        setResult({
          filters,
          error: e instanceof ApiError ? e.message : "Can't reach the server. Try again.",
        }),
      )
  }, [filters, searching])

  // Only use a response that matches the current filters. While a new search is
  // loading, the old results aren't shown, and a slow old reply can't overwrite a new one.
  const current = result?.filters === filters ? result : undefined
  const activities = current?.activities ?? null
  const error = current?.error

  const isCoordinator = role === 'coordinator'

  return (
    <section>
      <div className="page-header">
        <h1 className="page-title">Activity catalogue</h1>
        {isCoordinator && (
          <Link to="/activities/new" className="button button-outline">
            <Plus size={18} aria-hidden="true" />
            Add activity
          </Link>
        )}
      </div>

      {/* key: a new address (e.g. from a client's profile) gives a fresh form */}
      <CatalogueFilters key={filters} params={searchParams} onSearch={setSearchParams} />

      {searching && activities && (
        <p role="status">
          {activities.length} {activities.length === 1 ? 'activity matches' : 'activities match'}.
          Activities with unknown details are included, so check them with the provider.
        </p>
      )}

      {error && <p role="alert">{error}</p>}
      {!error && activities === null && <p role="status">Loading activities…</p>}
      {activities?.length === 0 &&
        (searching ? (
          <p>No activities match these filters. Try removing one.</p>
        ) : (
          <p>{isCoordinator ? 'No activities yet. Add your first one.' : 'No activities yet.'}</p>
        ))}

      {activities && activities.length > 0 && (
        <table>
          <thead>
            <tr>
              <th scope="col">Activity</th>
              <th scope="col">Provider</th>
              <th scope="col">Suburb</th>
              <th scope="col">Cost per session</th>
              <th scope="col"><span className="visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <tr key={a.activity_id}>
                <td>{a.name}</td>
                <td>{a.provider_name}</td>
                <td>{a.suburb_name ?? '—'}</td>
                <td>{formatCost(a.cost_per_session)}</td>
                <td>
                  <Link
                    to={`/activities/${a.activity_id}`}
                    aria-label={`${isCoordinator ? 'Edit' : 'View'} ${a.name}`}
                  >
                    {isCoordinator ? 'Edit' : 'View'}
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
