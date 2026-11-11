import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Search } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { formatDate } from '../lib/leads'
import { DAYS, LEVELS, SLOTS, SUPPORT_NEEDED, TRANSPORT } from '../lib/options'
import type { ClientDetail, Suburb, Tag } from '../lib/types'
import ClientLeads from '../components/ClientLeads'
import './ClientForm.css'
import './ClientProfile.css'

// Find an option's label, e.g. 'worker_present' → 'With a worker nearby'.
// Older clients can have empty required fields, so null shows as "Not set".
function labelOf(options: { value: string; label: string }[], value: string | null) {
  if (!value) return 'Not set'
  return options.find((o) => o.value === value)?.label ?? value
}

// A level as "Up to medium", or "Not set"
function upTo(level: string | null) {
  return level ? `Up to ${labelOf(LEVELS, level).toLowerCase()}` : 'Not set'
}

// "Sam Rivers" → "SR"
function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// Availability as one line per day, e.g. "Monday: morning, afternoon"
function availabilityLines(c: ClientDetail) {
  return DAYS.map((d) => {
    const slots = SLOTS.filter((s) =>
      c.availability.some((a) => a.day === d.value && a.slot === s.value),
    ).map((s) => s.label.toLowerCase())
    return slots.length ? `${d.label}: ${slots.join(', ')}` : null
  }).filter((line): line is string => line !== null)
}

// A card heading in English with its te reo name underneath (as in the hi-fi)
function CardHeading({ id, en, mi }: { id: string; en: string; mi: string }) {
  return (
    <h2 id={id} className="profile-card-heading">
      {en}
      <span lang="mi">{mi}</span>
    </h2>
  )
}

// SCRUM-117: a client's profile to read, with Edit profile and Find activities.
// Editing is its own page (/clients/:id/edit), and so is matching (/clients/:id/find).
export default function ClientProfile() {
  const { id } = useParams()
  const [client, setClient] = useState<ClientDetail>()
  const [suburbs, setSuburbs] = useState<Suburb[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [error, setError] = useState<string>()

  useEffect(() => {
    api<ClientDetail>(`/clients/${id}`)
      .then(setClient)
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? 'Client not found.'
            : "Can't load this client. Try again.",
        ),
      )
    // Names for the suburb and interests. If these fail, the profile still shows.
    Promise.all([api<Suburb[]>('/suburbs'), api<Tag[]>('/tags')])
      .then(([s, t]) => {
        setSuburbs(s)
        setTags(t)
      })
      .catch(() => {})
  }, [id])

  if (!client) {
    return error ? (
      <p role="alert">
        {error} <Link to="/clients">Back to clients</Link>
      </p>
    ) : (
      <p>Loading client…</p>
    )
  }

  const suburb = suburbs.find((s) => s.suburb_id === client.suburb_id)?.name
  const interests = client.interests.map(
    (tagId) => tags.find((t) => t.tag_id === tagId)?.name ?? '…',
  )
  const when = availabilityLines(client)

  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <ol>
          <li>
            <Link to="/clients">Clients</Link>
          </li>
          <li aria-current="page">{client.preferred_name}</li>
        </ol>
      </nav>

      <div className="profile-header">
        <span className="profile-avatar" aria-hidden="true">
          {initials(client.preferred_name)}
        </span>
        <div className="profile-title">
          <h1>{client.preferred_name}</h1>
          <p className="profile-meta">
            {suburb ?? 'No suburb set'} · updated {formatDate(client.updated_at)}
          </p>
        </div>
        <div className="profile-actions">
          <Link to={`/clients/${client.client_id}/edit`} className="button button-outline">
            Edit profile
          </Link>
          <Link to={`/clients/${client.client_id}/find`} className="button button-primary">
            <Search size={18} aria-hidden="true" />
            Find activities
          </Link>
        </div>
      </div>

      <div className="profile-grid">
        <div className="profile-column">
          <section className="profile-card" aria-labelledby="goals-heading">
            <CardHeading id="goals-heading" en="Goals" mi="Ngā whāinga" />
            {client.goals.length > 0 ? (
              <ol className="profile-goals">
                {client.goals.map((goal, i) => (
                  <li key={i}>{goal}</li>
                ))}
              </ol>
            ) : (
              <p className="profile-empty">No goals added yet.</p>
            )}
          </section>

          <section className="profile-card" aria-labelledby="interests-heading">
            <CardHeading id="interests-heading" en="Interests" mi="Ngā aronga" />
            {interests.length > 0 ? (
              <ul className="profile-chips">
                {interests.map((name, i) => (
                  <li key={i}>{name}</li>
                ))}
              </ul>
            ) : (
              <p className="profile-empty">No interests added yet.</p>
            )}
          </section>

          <section className="profile-card" aria-labelledby="taking-part-heading">
            <CardHeading id="taking-part-heading" en="Taking part" mi="Whai wāhi" />
            <p className={client.participation_notes ? undefined : 'profile-empty'}>
              {client.participation_notes ?? 'Nothing added yet.'}
            </p>
          </section>
        </div>

        <section className="profile-card" aria-labelledby="needs-heading">
          <CardHeading id="needs-heading" en="Access and support needs" mi="Ngā matea tautoko" />
          <dl className="profile-needs">
            <div>
              <dt>Physical demand</dt>
              <dd>
                <strong>{upTo(client.max_physical_demand)}</strong>
                {client.physical_notes && <span className="profile-note">{client.physical_notes}</span>}
              </dd>
            </div>
            <div>
              <dt>Sensory load</dt>
              <dd>
                <strong>
                  {upTo(client.max_sensory_load)}
                  {client.sensory_hard_limit && ' · hard limit'}
                </strong>
                {client.sensory_hard_limit && (
                  <span className="profile-note">Busier activities are left out.</span>
                )}
                {client.sensory_notes && <span className="profile-note">{client.sensory_notes}</span>}
              </dd>
            </div>
            <div>
              <dt>Step-free</dt>
              <dd>{client.needs_step_free ? 'Needed' : 'Not needed'}</dd>
            </div>
            <div>
              <dt>Transport</dt>
              <dd>
                {client.transport.length > 0
                  ? client.transport.map((t) => labelOf(TRANSPORT, t)).join(', ')
                  : 'Not set'}
              </dd>
            </div>
            <div>
              <dt>Support</dt>
              <dd>{labelOf(SUPPORT_NEEDED, client.support_needed)}</dd>
            </div>
            <div>
              <dt>Cost</dt>
              <dd>
                {client.max_cost === null ? 'No limit set' : `Up to $${client.max_cost} a session`}
              </dd>
            </div>
            <div>
              <dt>When</dt>
              <dd>
                {when.length > 0 ? when.map((line) => <span key={line}>{line}</span>) : 'Not set'}
              </dd>
            </div>
            <div>
              <dt>Area</dt>
              <dd>
                {client.travel_range_minutes
                  ? `Within ${client.travel_range_minutes} min${suburb ? ` of ${suburb}` : ''}`
                  : 'Not set'}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <ClientLeads clientId={client.client_id} />
    </>
  )
}
