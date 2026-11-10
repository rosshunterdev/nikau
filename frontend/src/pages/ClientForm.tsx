import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import { clientFilters } from '../lib/catalogueFilters'
import { DAYS, LEVELS, SLOTS, SUPPORT_NEEDED, TRANSPORT } from '../lib/options'
import type { ClientDetail, Suburb, Tag } from '../lib/types'
import ClientLeads from '../components/ClientLeads'
import FindActivities from '../components/FindActivities'

// What the form holds while you type. Numbers stay as text until saving.
// availability is stored as keys like "mon-morning" to make ticking easy.
type FormState = {
  preferred_name: string
  birth_year: string
  suburb_id: string
  support_needed: string
  max_physical_demand: string
  needs_step_free: boolean
  max_sensory_load: string
  sensory_hard_limit: boolean
  transport: string[]
  max_cost: string
  goals: string[]
  participation_notes: string
  physical_notes: string
  sensory_notes: string
  travel_range_minutes: string
  interests: string[]
  availability: string[]
}

// Second-pass fields (SCRUM-94)
const MAX_GOALS = 5
const NOTES_HINT = 'Describe what helps or gets in the way, not a diagnosis. No names or places.'

const EMPTY: FormState = {
  preferred_name: '',
  birth_year: '',
  suburb_id: '',
  support_needed: '',
  max_physical_demand: '',
  needs_step_free: false,
  max_sensory_load: '',
  sensory_hard_limit: false,
  transport: [],
  max_cost: '',
  goals: [],
  participation_notes: '',
  physical_notes: '',
  sensory_notes: '',
  travel_range_minutes: '',
  interests: [],
  availability: [],
}

// Turn the form into what the API expects (numbers, nulls, day/slot pairs)
function toPayload(f: FormState) {
  return {
    preferred_name: f.preferred_name.trim(),
    birth_year: f.birth_year ? Number(f.birth_year) : null,
    suburb_id: f.suburb_id || null,
    support_needed: f.support_needed,
    max_physical_demand: f.max_physical_demand,
    needs_step_free: f.needs_step_free,
    max_sensory_load: f.max_sensory_load,
    sensory_hard_limit: f.sensory_hard_limit,
    transport: f.transport,
    max_cost: f.max_cost ? Number(f.max_cost) : null,
    goals: f.goals.map((g) => g.trim()).filter((g) => g !== ''), // blank lines are dropped
    participation_notes: f.participation_notes.trim() || null, // empty box = no notes
    physical_notes: f.physical_notes.trim() || null,
    sensory_notes: f.sensory_notes.trim() || null,
    travel_range_minutes: f.travel_range_minutes ? Number(f.travel_range_minutes) : null,
    interests: f.interests,
    availability: f.availability.map((key) => {
      const [day, slot] = key.split('-')
      return { day, slot }
    }),
  }
}

// The opposite: fill the form from a saved client
function fromDetail(c: ClientDetail): FormState {
  return {
    preferred_name: c.preferred_name,
    birth_year: c.birth_year?.toString() ?? '',
    suburb_id: c.suburb_id ?? '',
    support_needed: c.support_needed,
    max_physical_demand: c.max_physical_demand,
    needs_step_free: c.needs_step_free,
    max_sensory_load: c.max_sensory_load,
    sensory_hard_limit: c.sensory_hard_limit,
    transport: c.transport,
    max_cost: c.max_cost?.toString() ?? '',
    goals: c.goals,
    participation_notes: c.participation_notes ?? '',
    physical_notes: c.physical_notes ?? '',
    sensory_notes: c.sensory_notes ?? '',
    travel_range_minutes: c.travel_range_minutes?.toString() ?? '',
    interests: c.interests,
    availability: c.availability.map((a) => `${a.day}-${a.slot}`),
  }
}

// The page. key={...} gives each address a fresh form, so going from
// one client to another (or to "Add client") never shows old values.
export default function ClientFormPage() {
  const { id } = useParams()
  return <ClientForm key={id ?? 'new'} id={id} />
}

function ClientForm({ id }: { id?: string }) {
  const navigate = useNavigate()

  // Adding: start empty. Editing: null until the client has loaded.
  const [form, setForm] = useState<FormState | null>(id ? null : EMPTY)

    // The client as last saved: the catalogue link uses this, not unsaved edits
  const [saved, setSaved] = useState<ClientDetail>()
  const [suburbs, setSuburbs] = useState<Suburb[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  // Goes up each time a lead is saved from Find activities, so the saved leads reload
  const [leadsVersion, setLeadsVersion] = useState(0)

  // Wide screens start with every section open; phones show only the first
  const [wide] = useState(() => window.matchMedia('(min-width: 768px)').matches)

  // Load the suburb list and interest tags for the form
  useEffect(() => {
    Promise.all([api<Suburb[]>('/suburbs'), api<Tag[]>('/tags')])
      .then(([s, t]) => {
        setSuburbs(s)
        setTags(t)
      })
      .catch(() => setError("Can't load the form options. Try again."))
  }, [])

  // Editing: load this client and fill the form
  useEffect(() => {
    if (!id) return
    api<ClientDetail>(`/clients/${id}`)
      .then((c) => {
        setSaved(c)
        setForm(fromDetail(c))
      })
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? 'Client not found.'
            : "Can't load this client. Try again.",
        ),
      )
  }, [id])

  // Change one field
  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  // Tick or untick a value in a list (transport, interests, availability)
  function toggle(key: 'transport' | 'interests' | 'availability', value: string) {
    setForm((f) =>
      f
        ? {
            ...f,
            [key]: f[key].includes(value)
              ? f[key].filter((v) => v !== value)
              : [...f[key], value],
          }
        : f,
    )
  }

  // Goals: change, add or remove one line (up to MAX_GOALS)
  function setGoal(index: number, text: string) {
    setForm((f) => (f ? { ...f, goals: f.goals.map((g, i) => (i === index ? text : g)) } : f))
  }
  function addGoal() {
    setForm((f) => (f && f.goals.length < MAX_GOALS ? { ...f, goals: [...f.goals, ''] } : f))
  }
  function removeGoal(index: number) {
    setForm((f) => (f ? { ...f, goals: f.goals.filter((_, i) => i !== index) } : f))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault() // stop the browser reloading the page
    if (!form) return
    setSaving(true)
    setError(undefined)
    try {
      // Adding → POST /clients. Editing → PATCH /clients/{id}
      await api<ClientDetail>(id ? `/clients/${id}` : '/clients', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(toPayload(form)),
      })
      navigate('/clients')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the server. Try again.")
    } finally {
      setSaving(false)
    }
  }

  // Suburbs grouped by council (Wellington City, Hutt City...) for the dropdown
  const councils = [...new Set(suburbs.map((s) => s.territorial_authority))].sort()

  // Editing, but the client isn't loaded yet (or couldn't be)
  if (!form) {
    return error ? (
      <p role="alert">
        {error} <Link to="/clients">Back to clients</Link>
      </p>
    ) : (
      <p>Loading client…</p>
    )
  }

  return (
    <>
    <form onSubmit={handleSubmit}>
       <h1>{id ? 'Edit client' : 'Add client'}</h1>
      <Link to="/clients">Back to clients</Link>
            {saved && (
        <Link to={`/activities?client=${saved.client_id}&${clientFilters(saved)}`}>
          Find activities in catalogue for {saved.preferred_name}
        </Link>
      )}

      {/* 1. About: always open */}
      <details open>
        <summary>About</summary>

        <label>
          Preferred name (required)
          <input
            value={form.preferred_name}
            onChange={(e) => set('preferred_name', e.target.value)}
            required
            maxLength={100}
          />
        </label>

        <label>
          Birth year
          <input
            type="number"
            min={1900}
            max={new Date().getFullYear()}
            value={form.birth_year}
            onChange={(e) => set('birth_year', e.target.value)}
          />
        </label>

        <label>
          Suburb
          <select value={form.suburb_id} onChange={(e) => set('suburb_id', e.target.value)}>
            <option value="">Not set</option>
            {councils.map((council) => (
              <optgroup key={council} label={council}>
                {suburbs
                  .filter((s) => s.territorial_authority === council)
                  .map((s) => (
                    <option key={s.suburb_id} value={s.suburb_id}>
                      {s.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      </details>

      {/* Goals (SCRUM-94): up to 5, in the client's own words */}
      <details open={wide}>
        <summary>Goals</summary>
        <fieldset>
          <legend>Their goals, in their own words where you can (up to {MAX_GOALS})</legend>
          {/* The position is the key: each input's text always comes from form.goals */}
          {form.goals.map((goal, i) => (
            <div key={i}>
              <label>
                Goal {i + 1}
                <input value={goal} maxLength={200} onChange={(e) => setGoal(i, e.target.value)} />
              </label>
              <button type="button" onClick={() => removeGoal(i)} aria-label={`Remove goal ${i + 1}`}>
                Remove
              </button>
            </div>
          ))}
          {form.goals.length < MAX_GOALS && (
            <button type="button" onClick={addGoal}>
              Add goal
            </button>
          )}
        </fieldset>
      </details>

      {/* 2. Support and access */}
      <details open={wide}>
        <summary>Support and access</summary>

        <fieldset>
          <legend>Support needed (required)</legend>
          {SUPPORT_NEEDED.map((o) => (
            <label key={o.value}>
              <input
                type="radio"
                name="support_needed"
                value={o.value}
                checked={form.support_needed === o.value}
                onChange={() => set('support_needed', o.value)}
                required
              />
              {o.label}
            </label>
          ))}
        </fieldset>

        <label>
          Most physical activity they can manage (required)
          <select
            value={form.max_physical_demand}
            onChange={(e) => set('max_physical_demand', e.target.value)}
            required
          >
            <option value="">Choose…</option>
            {LEVELS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label>
          Physical notes
          <textarea
            rows={2}
            maxLength={1000}
            aria-describedby="notes-hint"
            value={form.physical_notes}
            onChange={(e) => set('physical_notes', e.target.value)}
          />
        </label>

        <label>
          <input
            type="checkbox"
            checked={form.needs_step_free}
            onChange={(e) => set('needs_step_free', e.target.checked)}
          />
          Needs step-free access
        </label>

        <label>
          Most noise and busyness they can manage (required)
          <select
            value={form.max_sensory_load}
            onChange={(e) => set('max_sensory_load', e.target.value)}
            required
          >
            <option value="">Choose…</option>
            {LEVELS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <label>
          <input
            type="checkbox"
            checked={form.sensory_hard_limit}
            onChange={(e) => set('sensory_hard_limit', e.target.checked)}
          />
          This is a hard limit (never suggest anything louder or busier)
        </label>

        <label>
          Sensory notes
          <textarea
            rows={2}
            maxLength={1000}
            aria-describedby="notes-hint"
            value={form.sensory_notes}
            onChange={(e) => set('sensory_notes', e.target.value)}
          />
        </label>

        <label>
          How they like to take part
          <textarea
            rows={2}
            maxLength={1000}
            aria-describedby="notes-hint"
            value={form.participation_notes}
            onChange={(e) => set('participation_notes', e.target.value)}
          />
        </label>

        <p id="notes-hint">{NOTES_HINT}</p>
      </details>

      {/* 3. Getting there and cost */}
      <details open={wide}>
        <summary>Getting there and cost</summary>

        <fieldset>
          <legend>Transport they can use</legend>
          {TRANSPORT.map((o) => (
            <label key={o.value}>
              <input
                type="checkbox"
                checked={form.transport.includes(o.value)}
                onChange={() => toggle('transport', o.value)}
              />
              {o.label}
            </label>
          ))}
        </fieldset>

        <label>
          How far they can travel (minutes)
          <input
            type="number"
            min={1}
            value={form.travel_range_minutes}
            onChange={(e) => set('travel_range_minutes', e.target.value)}
            aria-describedby="travel-hint"
          />
        </label>
        <p id="travel-hint">Not used for suggestions yet.</p>

        <label>
          Most they can pay per session ($)
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.max_cost}
            onChange={(e) => set('max_cost', e.target.value)}
          />
        </label>
      </details>

      {/* 4. Interests */}
      <details open={wide}>
        <summary>Interests</summary>
        <fieldset>
          <legend>What they enjoy</legend>
          {tags.map((t) => (
            <label key={t.tag_id}>
              <input
                type="checkbox"
                checked={form.interests.includes(t.tag_id)}
                onChange={() => toggle('interests', t.tag_id)}
              />
              {t.name}
            </label>
          ))}
        </fieldset>
      </details>

      {/* 5. Availability: a day × time-of-day grid */}
      <details open={wide}>
        <summary>Availability</summary>
        <table>
          <caption>When they're free</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              {SLOTS.map((s) => (
                <th key={s.value} scope="col">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((d) => (
              <tr key={d.value}>
                <th scope="row">{d.label}</th>
                {SLOTS.map((s) => {
                  const key = `${d.value}-${s.value}`
                  return (
                    <td key={key}>
                      <input
                        type="checkbox"
                        aria-label={`${d.label} ${s.label}`}
                        checked={form.availability.includes(key)}
                        onChange={() => toggle('availability', key)}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {error && <p role="alert">{error}</p>}

    <button type="submit" disabled={saving}>
    {saving ? 'Saving…' : id ? 'Save changes' : 'Save client'}
    </button>
   </form>

  {/* Find activities and saved leads: only for an existing client */}
  {saved && (
      <FindActivities client={saved} onSaved={() => setLeadsVersion((v) => v + 1)} />
    )}
    {id && <ClientLeads key={leadsVersion} clientId={id} />}
    </>
  )
}
