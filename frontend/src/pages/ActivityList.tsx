import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Check, Plus } from 'lucide-react'
import CatalogueFilters from '../components/CatalogueFilters'
import { api, ApiError } from '../lib/api'
import { activityMeta } from '../lib/activityFormat'
import { filtersOnly } from '../lib/catalogueFilters'
import { announceLeadsChanged, formatDate } from '../lib/leads'
import { ACTIVITY_TRANSPORT, LEVELS } from '../lib/options'
import type { ActivitySummary, ClientDetail, Lead } from '../lib/types'
import { useRole } from '../lib/useRole'
import './ActivityList.css'

// SCRUM-129 fix 06 (hi-fi 09): results 10 at a time, and three ways to sort them
const PAGE_SIZE = 10
type Sort = 'name' | 'cost' | 'checked'
const SORTS: { value: Sort; label: string }[] = [
  { value: 'name', label: 'A to Z' },
  { value: 'cost', label: 'Cost, lowest first' },
  { value: 'checked', label: 'Recently checked' },
]

// Unknown cost or check date goes last, whichever way it's sorted
function sorted(list: ActivitySummary[], sort: Sort) {
  const copy = [...list]
  if (sort === 'cost') {
    copy.sort((a, b) => (a.cost_per_session ?? Infinity) - (b.cost_per_session ?? Infinity))
  } else if (sort === 'checked') {
    copy.sort((a, b) => (b.checked_at ?? '').localeCompare(a.checked_at ?? ''))
  }
  return copy // 'name': the API already sends A to Z
}

// The small grey tags on a row: levels, step-free and how to get there
function chips(a: ActivitySummary) {
  const level = (value: string | null) =>
    LEVELS.find((l) => l.value === value)?.label.toLowerCase()
  const out: string[] = []
  if (a.physical_demand) out.push(`Physical: ${level(a.physical_demand)}`)
  if (a.sensory_load) out.push(`Sensory: ${level(a.sensory_load)}`)
  if (a.step_free_access) out.push('Step-free')
  for (const t of a.transport_options) {
    const label = ACTIVITY_TRANSPORT.find((o) => o.value === t)?.label
    if (label) out.push(label)
  }
  return out
}

// "22 Sep" (the year only when it isn't this year)
function checkedOn(iso: string) {
  const d = new Date(iso)
  const thisYear = d.getFullYear() === new Date().getFullYear()
  return thisYear
    ? d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
    : formatDate(iso)
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
      announceLeadsChanged()
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

  const [sort, setSort] = useState<Sort>('name')

  return (
    <section>
      <div className="page-header catalogue-header">
        <div>
          <h1 className="page-title">Activity catalogue</h1>
          <p className="catalogue-mi" lang="mi">
            Rārangi ngohe
          </p>
          <p className="catalogue-intro">
            Every activity here has been checked by a person before it's listed.
          </p>
        </div>
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
          <div className="catalogue-for">
            <p>
              Finding activities for <strong>{forClient.name}</strong>. Filters are set from{' '}
              {forClient.name}'s profile.
            </p>
            <Link to={`/clients/${forClient.id}`}>Back to {forClient.name}'s profile</Link>
          </div>
        ) : (
          clientError && <p role="alert">{clientError}</p>
        ))}

      <div className="catalogue-layout">
        {/* key: a fresh form only when the address changes from outside the form */}
        <CatalogueFilters key={formKey} params={searchParams} onSearch={handleSearch} />

        <div className="catalogue-results">
          <div className="catalogue-results-head">
            {/* Screen readers hear the new count after each search */}
            <p role="status" className="catalogue-count">
              {activities &&
                (searching ? (
                  <>
                    <strong>
                      {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
                    </strong>{' '}
                    match these filters
                  </>
                ) : (
                  <strong>
                    {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
                  </strong>
                ))}
            </p>
            <label className="catalogue-sort">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                {SORTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* SCRUM-85: result of the last save, announced to screen readers */}
          <p role="status" className={saveMessage ? 'catalogue-saved' : 'visually-hidden'}>
            {saveMessage && (
              <>
                <Check size={18} aria-hidden="true" /> {saveMessage}
              </>
            )}
          </p>

          {error && <p role="alert">{error}</p>}
          {!error && activities === null && <p>Loading activities…</p>}
          {activities?.length === 0 &&
            (searching ? (
              <p className="catalogue-empty">No activities match these filters. Try removing one.</p>
            ) : (
              <p className="catalogue-empty">
                {isCoordinator ? 'No activities yet. Add your first one.' : 'No activities yet.'}
              </p>
            ))}

          {activities && activities.length > 0 && (
            // key: a new search or sort starts again at the first 10
            <CatalogueRows
              key={`${filters}|${sort}`}
              activities={sorted(activities, sort)}
              isCoordinator={isCoordinator}
              forClient={forClient}
              savingId={savingId}
              onSave={saveLead}
            />
          )}
          {/* Under the list, so the list lines up with the filter panel */}
          {searching && activities && activities.length > 0 && (
            <p className="catalogue-note">
              Activities with unknown details are included, so check them with the provider.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

type RowsProps = {
  activities: ActivitySummary[]
  isCoordinator: boolean
  forClient?: ForClient
  savingId?: string
  onSave: (a: ActivitySummary) => void
}

// The results list, 10 at a time with "Show more"
function CatalogueRows({ activities, isCoordinator, forClient, savingId, onSave }: RowsProps) {
  const [shown, setShown] = useState(PAGE_SIZE)
  // After "Show more", move keyboard focus to the first new activity
  const focusIndex = useRef<number | null>(null)
  const links = useRef<(HTMLAnchorElement | null)[]>([])
  useEffect(() => {
    if (focusIndex.current !== null) {
      links.current[focusIndex.current]?.focus()
      focusIndex.current = null
    }
  }, [shown])

  const left = activities.length - shown
  return (
    <>
      <ul className="catalogue-list">
        {activities.slice(0, shown).map((a, i) => {
          const meta = activityMeta({
            suburb: a.suburb_name,
            sessions: a.sessions,
            cost_per_session: a.cost_per_session,
          })
          const tags = chips(a)
          return (
            <li key={a.activity_id} className="catalogue-row">
              <div className="catalogue-row-main">
                <h2>
                  <Link
                    to={`/activities/${a.activity_id}`}
                    ref={(el) => {
                      links.current[i] = el
                    }}
                  >
                    {a.name}
                  </Link>
                </h2>
                {meta && <p className="catalogue-row-meta">{meta}</p>}
                <p className="catalogue-row-meta">
                  {a.provider_name}
                  {a.checked_at && ` · Checked ${checkedOn(a.checked_at)}`}
                </p>
              </div>
              {tags.length > 0 && (
                <ul className="catalogue-chips" aria-label={`About ${a.name}`}>
                  {tags.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
              <div className="catalogue-row-actions">
                {/* SCRUM-85: save for the client, or say why it can't be saved */}
                {forClient &&
                  (!a.consent_given ? (
                    <span className="catalogue-row-note">Needs provider consent</span>
                  ) : forClient.saved.has(a.activity_id) ? (
                    <span className="catalogue-row-saved">
                      <Check size={18} aria-hidden="true" /> Saved
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="button-outline"
                      onClick={() => onSave(a)}
                      disabled={savingId === a.activity_id}
                      aria-label={`Save lead: ${a.name} for ${forClient.name}`}
                    >
                      {savingId === a.activity_id ? 'Saving…' : 'Save lead'}
                    </button>
                  ))}
                {isCoordinator && (
                  <Link to={`/activities/${a.activity_id}`} aria-label={`Edit ${a.name}`}>
                    Edit
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {left > 0 && (
        <div className="catalogue-more">
          <button
            type="button"
            className="button-outline"
            onClick={() => {
              focusIndex.current = shown
              setShown((n) => n + PAGE_SIZE)
            }}
          >
            Show more ({left})
          </button>
        </div>
      )}
    </>
  )
}
