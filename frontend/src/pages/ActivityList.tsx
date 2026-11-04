import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Plus } from 'lucide-react'
import CatalogueFilters from '../components/CatalogueFilters'
import { api, ApiError } from '../lib/api'
import { filtersOnly } from '../lib/catalogueFilters'
import type { ActivitySummary, ClientDetail, Lead } from '../lib/types'
import { useRole } from '../lib/useRole'

// Show a cost like "$15.00", or "Free" for 0
function formatCost(cost: number | null) {
  if (cost === null) return 'Not known'
  if (cost === 0) return 'Free'
  return cost.toLocaleString('en-NZ', { style: 'currency', currency: 'NZD' })
}

type Result = { filters: string; activities?: ActivitySummary[]; error?: string }

// SCRUM-85: the client the catalogue was opened for, and the activities already saved for them
type ForClient = { id: string; name: string; saved: Set<string> }

export default function ActivityList() {
  const role = useRole()
  const [searchParams, setSearchParams] = useSearchParams()
  // The last response, and which filters it was for
  const [result, setResult] = useState<Result>()

  // The filters in the address, e.g. "max_physical_demand=low&available=sat-morning"
  const filters = filtersOnly(searchParams).toString()
  const searching = filters !== ''

  // SCRUM-85: opened from a client's profile? (?client=<id>, never sent to the search API)
  const clientId = searchParams.get('client')
  const [client, setClient] = useState<ForClient>()
  const [clientError, setClientError] = useState<string>()
  const [savingId, setSavingId] = useState<string>()
  const [saveMessage, setSaveMessage] = useState<string>()

  // SCRUM-85 (fixes Ross's #21 note): the filters the form is showing. The form only
  // gets a fresh start when the address changes from outside it (another client's link,
  // the back button), not after its own Search, so open panels stay open.
  const [formFilters, setFormFilters] = useState(filters)
  const [formKey, setFormKey] = useState(0)
  // What the form's own Search asked for. The address updates a moment later,
  // so this tells "the form searched" apart from "the address changed from outside".
  const [ownSearch, setOwnSearch] = useState<string>()
  if (filters !== formFilters) {
    setFormFilters(filters)
    if (filters !== ownSearch) setFormKey((k) => k + 1)
  }

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

  // SCRUM-85: load the client's name and which activities are already saved for them
  useEffect(() => {
    if (!clientId) return
    Promise.all([
      api<ClientDetail>(`/clients/${clientId}`),
      api<Lead[]>(`/clients/${clientId}/leads`),
    ])
      .then(([c, leads]) =>
        setClient({
          id: c.client_id,
          name: c.preferred_name,
          saved: new Set(leads.map((l) => l.activity_id)),
        }),
      )
      .catch(() => setClientError("Can't load this client, so leads can't be saved here."))
  }, [clientId])

  // Only use a response that matches the current filters. While a new search is
  // loading, the old results aren't shown, and a slow old reply can't overwrite a new one.
  const current = result?.filters === filters ? result : undefined
  const activities = current?.activities ?? null
  const error = current?.error

  // SCRUM-85: same idea for the client, so a previous client's details never show
  const forClient = client?.id === clientId ? client : undefined

  const isCoordinator = role === 'coordinator'

  // SCRUM-85: search, keeping the client in the address
  function handleSearch(draft: URLSearchParams) {
    const next = new URLSearchParams(draft)
    if (clientId) next.set('client', clientId)
    setOwnSearch(filtersOnly(next).toString()) // the form already shows these: don't reset it
    setSearchParams(next)
  }

  // SCRUM-85: mark an activity as saved for the client, so its button becomes "Saved"
  function markSaved(activityId: string) {
    setClient((c) => (c ? { ...c, saved: new Set(c.saved).add(activityId) } : c))
  }

  // SCRUM-85: save an activity as a lead. From the catalogue it's always manual_search.
  async function saveLead(a: ActivitySummary) {
    if (!forClient) return
    setSavingId(a.activity_id)
    setSaveMessage(undefined)
    try {
      await api<Lead>(`/clients/${forClient.id}/leads`, {
        method: 'POST',
        body: JSON.stringify({ activity_id: a.activity_id, source: 'manual_search' }),
      })
      markSaved(a.activity_id)
      setSaveMessage(`Saved ${a.name} for ${forClient.name}.`)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Already saved (e.g. in another tab): show it as saved, not as an error
        markSaved(a.activity_id)
        setSaveMessage(`${a.name} is already saved for ${forClient.name}.`)
      } else {
        setSaveMessage(e instanceof ApiError ? e.message : "Can't reach the server. Try again.")
      }
    } finally {
      setSavingId(undefined)
    }
  }

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

      {/* SCRUM-85: who the catalogue is open for */}
      {clientId &&
        (forClient ? (
          <p>
            Finding activities for <strong>{forClient.name}</strong>.{' '}
            <Link to={`/clients/${forClient.id}`}>Back to {forClient.name}'s profile</Link>
          </p>
        ) : (
          clientError && <p role="alert">{clientError}</p>
        ))}

      {/* key: a fresh form only when the address changes from outside the form */}
      <CatalogueFilters key={formKey} params={searchParams} onSearch={handleSearch} />

      {searching && activities && (
        <p role="status">
          {activities.length} {activities.length === 1 ? 'activity matches' : 'activities match'}.
          Activities with unknown details are included, so check them with the provider.
        </p>
      )}

      {/* SCRUM-85: result of the last save, announced to screen readers */}
      {saveMessage && <p role="status">{saveMessage}</p>}

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
                  {/* SCRUM-85: save for the client, or say why it can't be saved */}
                  {forClient &&
                    (!a.consent_given ? (
                      <span>Needs provider consent</span>
                    ) : forClient.saved.has(a.activity_id) ? (
                      <span>
                        Saved<span aria-hidden="true"> ✓</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => saveLead(a)}
                        disabled={savingId === a.activity_id}
                        aria-label={`Save as lead: ${a.name} for ${forClient.name}`}
                      >
                        {savingId === a.activity_id ? 'Saving…' : 'Save as lead'}
                      </button>
                    ))}{' '}
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
