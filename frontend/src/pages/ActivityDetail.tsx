import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Check, Globe, Mail, Phone } from 'lucide-react'
import LevelBars from '../components/LevelBars'
import { api, ApiError } from '../lib/api'
import { formatCost, formatSession } from '../lib/activityFormat'
import { announceLeadsChanged, formatDate } from '../lib/leads'
import { ACTIVITY_TRANSPORT, LEVELS, SUPPORT_WORKER_POLICY } from '../lib/options'
import type { ActivityDetail as Activity, ClientSummary, Lead, Tag } from '../lib/types'
import { useRole } from '../lib/useRole'
import './ClientForm.css' // breadcrumb
import './ClientProfile.css'
import './ActivityDetail.css'

const NOT_KNOWN = 'Not known yet'

// A card heading in English with its te reo name underneath, like the client profile
function CardHeading({ id, en, mi }: { id: string; en: string; mi?: string }) {
  return (
    <h2 id={id} className="profile-card-heading">
      {en}
      {mi && <span lang="mi">{mi}</span>}
    </h2>
  )
}

// "16 and over", "Under 18", "18 to 65", or not known
function ages(a: Activity) {
  if (a.min_age !== null && a.max_age !== null) return `${a.min_age} to ${a.max_age}`
  if (a.min_age !== null) return `${a.min_age} and over`
  if (a.max_age !== null) return `Up to ${a.max_age}`
  return 'All ages'
}

function levelLabel(level: string | null) {
  return LEVELS.find((l) => l.value === level)?.label ?? NOT_KNOWN
}

// SCRUM-129 fix 07 (hi-fi 10): one activity to read, laid out like the client profile.
// Save it as a lead for a client here; coordinators edit it at /activities/:id/edit.
export default function ActivityDetail() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isCoordinator = useRole() === 'coordinator'

  const [activity, setActivity] = useState<Activity>()
  const [tags, setTags] = useState<Tag[]>([])
  const [error, setError] = useState<string>()

  // Save as a lead: which client, and whether it's already saved for them.
  // Coming from a client's pages (?client=…) picks that client.
  const [clients, setClients] = useState<ClientSummary[]>([])
  const [clientId, setClientId] = useState(searchParams.get('client') ?? '')
  const [savedFor, setSavedFor] = useState<Set<string>>(new Set()) // client ids
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    api<Activity>(`/activities/${id}`)
      .then(setActivity)
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? 'Activity not found.'
            : "Can't load this activity. Try again.",
        ),
      )
    // Interest names and the client list. If these fail, the page still shows.
    api<Tag[]>('/tags')
      .then(setTags)
      .catch(() => {})
    api<ClientSummary[]>('/clients')
      .then((list) => {
        setClients(list)
        // Only one client: pick them, so it's one click to save
        if (list.length === 1) setClientId((current) => current || list[0].client_id)
      })
      .catch(() => {})
  }, [id])

  // Is it already saved for the chosen client?
  useEffect(() => {
    if (!clientId) return
    api<Lead[]>(`/clients/${clientId}/leads`)
      .then((leads) => {
        if (leads.some((l) => l.activity_id === id)) {
          setSavedFor((s) => new Set(s).add(clientId))
        }
      })
      .catch(() => {})
  }, [clientId, id])

  if (!activity) {
    return error ? (
      <p role="alert">
        {error} <Link to="/activities">Back to the catalogue</Link>
      </p>
    ) : (
      <p>Loading activity…</p>
    )
  }

  const client = clients.find((c) => c.client_id === clientId)
  const interests = activity.tags.map((t) => tags.find((x) => x.tag_id === t)?.name ?? '…')
  const transport = activity.transport_options
    .map((t) => ACTIVITY_TRANSPORT.find((o) => o.value === t)?.label ?? t)
    .join(', ')
  const policy = SUPPORT_WORKER_POLICY.find((p) => p.value === activity.support_worker_policy)
  const cost = formatCost(activity.cost_per_session)
  const hasContact =
    activity.provider_phone || activity.provider_email || activity.provider_website

  async function save() {
    if (!activity || !client) return
    setSaving(true)
    setMessage(undefined)
    try {
      await api<Lead>(`/clients/${client.client_id}/leads`, {
        method: 'POST',
        body: JSON.stringify({ activity_id: activity.activity_id, source: 'manual_search' }),
      })
      setSavedFor((s) => new Set(s).add(client.client_id))
      setMessage(`Saved ${activity.name} for ${client.preferred_name}.`)
      announceLeadsChanged()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already saved (e.g. on another page): show it as saved, not as an error
        setSavedFor((s) => new Set(s).add(client.client_id))
        setMessage(`${activity.name} is already saved for ${client.preferred_name}.`)
      } else {
        setMessage(err instanceof ApiError ? err.message : "Can't reach the server. Try again.")
      }
    } finally {
      setSaving(false)
    }
  }

  // Back to the catalogue, still for the same client if we came from one
  const catalogueLink = searchParams.get('client')
    ? `/activities?client=${searchParams.get('client')}`
    : '/activities'

  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <ol>
          <li>
            <Link to={catalogueLink}>Activity catalogue</Link>
          </li>
          <li aria-current="page">{activity.name}</li>
        </ol>
      </nav>

      <div className="profile-header activity-header">
        <div className="profile-title">
          <h1>{activity.name}</h1>
          <p className="profile-meta">
            {[activity.provider_name, activity.suburb_name].filter(Boolean).join(' · ')}
          </p>
          {interests.length > 0 && (
            <ul className="profile-chips activity-tags" aria-label="Interests">
              {interests.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="profile-actions activity-actions">
          {/* Save as a lead: same button and "Saved for Sam" as Find activities */}
          {clients.length > 0 && (
            <div className="activity-save">
              {/* The label is for screen readers; the first option says it on screen */}
              <label htmlFor="save-for" className="visually-hidden">
                Save as a lead for
              </label>
              <select
                id="save-for"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value)
                  setMessage(undefined)
                }}
              >
                <option value="">Select client</option>
                {clients.map((c) => (
                  <option key={c.client_id} value={c.client_id}>
                    {c.preferred_name}
                  </option>
                ))}
              </select>
              {client && savedFor.has(client.client_id) ? (
                <span className="activity-saved">
                  <Check size={18} aria-hidden="true" /> Saved for {client.preferred_name}
                </span>
              ) : (
                <button
                  type="button"
                  className="button-outline"
                  onClick={save}
                  disabled={!client || saving}
                >
                  {saving ? 'Saving…' : 'Save lead'}
                </button>
              )}
              {/* Always present, so screen readers hear the result */}
              <p role="status" className={message ? 'activity-save-message' : 'visually-hidden'}>
                {message}
              </p>
            </div>
          )}
          {isCoordinator && (
            <Link to={`/activities/${activity.activity_id}/edit`} className="button button-outline">
              Edit activity
            </Link>
          )}
        </div>
      </div>

      {/* Who runs it and when it was last checked (like the profile's info bar) */}
      <dl className="profile-facts">
        <div>
          <dt>Checked</dt>
          <dd>
            {activity.checked_at
              ? `${formatDate(activity.checked_at)}${activity.checked_by_name ? ` by ${activity.checked_by_name}` : ''}`
              : 'Not checked yet'}
          </dd>
        </div>
        <div className="profile-facts-muted">
          <dt>Listing updated</dt>
          <dd>{formatDate(activity.updated_at)}</dd>
        </div>
      </dl>

      <div className="profile-grid">
        <div className="profile-column">
          <section className="profile-card" aria-labelledby="about-heading">
            <CardHeading id="about-heading" en="About" />
            <p className={activity.description ? undefined : 'profile-empty'}>
              {activity.description ?? 'No description yet.'}
            </p>
          </section>

          <section className="profile-card" aria-labelledby="when-heading">
            <CardHeading id="when-heading" en="When and where" mi="Te wā me te wāhi" />
            <dl className="profile-needs">
              <div>
                <dt>When</dt>
                <dd>
                  {activity.sessions.length > 0
                    ? activity.sessions.map((s) => (
                        <span key={`${s.day}-${s.start_time}`}>{formatSession(s)}</span>
                      ))
                    : NOT_KNOWN}
                </dd>
              </div>
              <div>
                <dt>Where</dt>
                <dd>{activity.suburb_name ?? NOT_KNOWN}</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>{cost ? (cost === 'Free' ? 'Free' : `${cost} a session`) : NOT_KNOWN}</dd>
              </div>
              <div>
                <dt>Ages</dt>
                <dd>{ages(activity)}</dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>
                  {hasContact ? (
                    <ul className="activity-contact" aria-label={`Contact ${activity.provider_name ?? 'the provider'}`}>
                      {activity.provider_phone && (
                        <li>
                          <Phone size={18} aria-hidden="true" />
                          <a href={`tel:${activity.provider_phone.replace(/\s/g, '')}`}>
                            {activity.provider_phone}
                          </a>
                        </li>
                      )}
                      {activity.provider_email && (
                        <li>
                          <Mail size={18} aria-hidden="true" />
                          <a href={`mailto:${activity.provider_email}`}>
                            {activity.provider_email}
                          </a>
                        </li>
                      )}
                      {activity.provider_website && (
                        <li>
                          <Globe size={18} aria-hidden="true" />
                          <a href={activity.provider_website} target="_blank" rel="noreferrer">
                            Website<span className="visually-hidden"> (opens in a new tab)</span>
                          </a>
                        </li>
                      )}
                    </ul>
                  ) : (
                    'Contact details not available'
                  )}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="profile-card" aria-labelledby="access-heading">
          <CardHeading id="access-heading" en="Access" />
          <dl className="profile-needs">
            <div>
              <dt>Physical demand</dt>
              <dd>
                <strong className="profile-level">
                  <LevelBars level={activity.physical_demand} />
                  {levelLabel(activity.physical_demand)}
                </strong>
              </dd>
            </div>
            <div>
              <dt>Sensory load</dt>
              <dd>
                <strong className="profile-level">
                  <LevelBars level={activity.sensory_load} />
                  {levelLabel(activity.sensory_load)}
                </strong>
              </dd>
            </div>
            <div>
              <dt>Getting there</dt>
              <dd>{transport || NOT_KNOWN}</dd>
            </div>
            <div>
              <dt>Step-free</dt>
              <dd>
                {activity.step_free_access === null
                  ? NOT_KNOWN
                  : activity.step_free_access
                    ? 'Yes'
                    : 'No'}
              </dd>
            </div>
            <div>
              <dt>Support worker</dt>
              <dd>{policy?.label ?? NOT_KNOWN}</dd>
            </div>
          </dl>
        </section>
      </div>
    </>
  )
}
