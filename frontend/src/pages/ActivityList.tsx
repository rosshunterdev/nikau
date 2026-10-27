import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import type { ActivitySummary } from '../lib/types'
import { useRole } from '../lib/useRole'

// Show a cost like "$15.00", or "Free" for 0
function formatCost(cost: number | null) {
  if (cost === null) return 'Not known'
  if (cost === 0) return 'Free'
  return cost.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD' })
}

export default function ActivityList() {
  const role = useRole()
  const [activities, setActivities] = useState<ActivitySummary[] | null>(null)
  const [error, setError] = useState<string>()

  useEffect(() => {
    api<ActivitySummary[]>('/activities')
      .then(setActivities)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Can't reach the server. Try again."),
      )
  }, [])

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

      {error && <p role="alert">{error}</p>}
      {!error && activities === null && <p role="status">Loading activities…</p>}
      {activities?.length === 0 && (
        <p>{isCoordinator ? 'No activities yet. Add your first one.' : 'No activities yet.'}</p>
      )}

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