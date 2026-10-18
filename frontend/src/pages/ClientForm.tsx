import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import { DAYS, LEVELS, SLOTS, SUPPORT_NEEDED, TRANSPORT } from '../lib/options'
import type { ClientDetail, Suburb, Tag } from '../lib/types'

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
  interests: string[]
  availability: string[]
}

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
  const [suburbs, setSuburbs] = useState<Suburb[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

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
      .then((c) => setForm(fromDetail(c)))
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
    <form onSubmit={handleSubmit}>
       <h1>{id ? 'Edit client' : 'Add client'}</h1>
      <Link to="/clients">Back to clients</Link>

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
  )
}