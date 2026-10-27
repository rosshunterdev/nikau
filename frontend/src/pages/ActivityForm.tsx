import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import { ACTIVITY_TRANSPORT, DAYS, LEVELS, SUPPORT_WORKER_POLICY } from '../lib/options'
import type { ActivityDetail, Day, Provider, Suburb, Tag } from '../lib/types'
import { useRole } from '../lib/useRole'

type SessionRow = { day: Day; start_time: string; end_time: string }

// What the form holds while you type. Numbers stay as text until saving.
type FormState = {
  name: string
  provider_id: string
  description: string
  suburb_id: string
  physical_demand: string
  sensory_load: string
  step_free_access: '' | 'yes' | 'no' // '' = not known
  min_age: string
  max_age: string
  cost_per_session: string
  transport_options: string[]
  support_worker_policy: string
  checked_at: string
  tags: string[]
  sessions: SessionRow[]
}

const EMPTY: FormState = {
  name: '',
  provider_id: '',
  description: '',
  suburb_id: '',
  physical_demand: '',
  sensory_load: '',
  step_free_access: '',
  min_age: '',
  max_age: '',
  cost_per_session: '',
  transport_options: [],
  support_worker_policy: '',
  checked_at: '',
  tags: [],
  sessions: [],
}

const NEW_SESSION: SessionRow = { day: 'mon', start_time: '10:00', end_time: '11:00' }

// Empty text becomes null ("not known"); numbers become numbers
const textOrNull = (v: string) => v.trim() || null
const numberOrNull = (v: string) => (v === '' ? null : Number(v))

function toPayload(f: FormState) {
  return {
    name: f.name.trim(),
    provider_id: f.provider_id,
    description: textOrNull(f.description),
    suburb_id: f.suburb_id || null,
    physical_demand: f.physical_demand || null,
    sensory_load: f.sensory_load || null,
    step_free_access: f.step_free_access === '' ? null : f.step_free_access === 'yes',
    min_age: numberOrNull(f.min_age),
    max_age: numberOrNull(f.max_age),
    cost_per_session: numberOrNull(f.cost_per_session),
    transport_options: f.transport_options,
    support_worker_policy: f.support_worker_policy || null,
    checked_at: f.checked_at || null,
    tags: f.tags,
    sessions: f.sessions,
  }
}

function fromDetail(a: ActivityDetail): FormState {
  return {
    name: a.name,
    provider_id: a.provider_id,
    description: a.description ?? '',
    suburb_id: a.suburb_id ?? '',
    physical_demand: a.physical_demand ?? '',
    sensory_load: a.sensory_load ?? '',
    step_free_access: a.step_free_access === null ? '' : a.step_free_access ? 'yes' : 'no',
    min_age: a.min_age?.toString() ?? '',
    max_age: a.max_age?.toString() ?? '',
    cost_per_session: a.cost_per_session?.toString() ?? '',
    transport_options: a.transport_options,
    support_worker_policy: a.support_worker_policy ?? '',
    checked_at: a.checked_at ?? '',
    tags: a.tags,
    // The API sends "13:00:00"; a time box wants "13:00"
    sessions: a.sessions.map((s) => ({
      day: s.day,
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
    })),
  }
}

export default function ActivityFormPage() {
  const { id } = useParams()
  return <ActivityForm key={id ?? 'new'} id={id} />
}

function ActivityForm({ id }: { id?: string }) {
  const navigate = useNavigate()
  const canEdit = useRole() === 'coordinator'

  const [form, setForm] = useState<FormState | null>(id ? null : EMPTY)
  const [providers, setProviders] = useState<Provider[]>([])
  const [suburbs, setSuburbs] = useState<Suburb[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  // Wide screens start with every section open; phones show only the first
  const [wide] = useState(() => window.matchMedia('(min-width: 768px)').matches)

  // Load the dropdown and chip options
  useEffect(() => {
    Promise.all([api<Provider[]>('/providers'), api<Suburb[]>('/suburbs'), api<Tag[]>('/tags')])
      .then(([p, s, t]) => {
        setProviders(p)
        setSuburbs(s)
        setTags(t)
      })
      .catch(() => setError("Can't load the form options. Try again."))
  }, [])

  // Editing or viewing: load this activity
  useEffect(() => {
    if (!id) return
    api<ActivityDetail>(`/activities/${id}`)
      .then((a) => setForm(fromDetail(a)))
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? 'Activity not found.'
            : "Can't load this activity. Try again.",
        ),
      )
  }, [id])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  function toggle(key: 'transport_options' | 'tags', value: string) {
    setForm((f) =>
      f
        ? {
            ...f,
            [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
          }
        : f,
    )
  }

  // Sessions: change one field of one row, add a row, remove a row
  function setSession(index: number, key: keyof SessionRow, value: string) {
    setForm((f) =>
      f
        ? {
            ...f,
            sessions: f.sessions.map((s, i) => (i === index ? { ...s, [key]: value } : s)),
          }
        : f,
    )
  }
  function addSession() {
    setForm((f) => (f ? { ...f, sessions: [...f.sessions, NEW_SESSION] } : f))
  }
  function removeSession(index: number) {
    setForm((f) => (f ? { ...f, sessions: f.sessions.filter((_, i) => i !== index) } : f))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form || !canEdit) return
    setSaving(true)
    setError(undefined)
    try {
      await api<ActivityDetail>(id ? `/activities/${id}` : '/activities', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(toPayload(form)),
      })
      navigate('/activities')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the server. Try again.")
    } finally {
      setSaving(false)
    }
  }

  // Workers can't add activities
  if (!id && !canEdit) return <p>Page not found.</p>

  const councils = [...new Set(suburbs.map((s) => s.territorial_authority))].sort()

  if (!form) {
    return error ? (
      <p role="alert">
        {error} <Link to="/activities">Back to activities</Link>
      </p>
    ) : (
      <p>Loading activity…</p>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>{!id ? 'Add activity' : canEdit ? 'Edit activity' : form.name}</h1>
      <Link to="/activities">Back to activities</Link>

      {/* disabled here disables every input inside: read-only for workers */}
      <fieldset disabled={!canEdit} className="form-body">
        {/* 1. About: always open */}
        <details open>
          <summary>About</summary>

          <label>
            Name (required)
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              maxLength={200}
            />
          </label>

          <label>
            Provider (required)
            <select
              value={form.provider_id}
              onChange={(e) => set('provider_id', e.target.value)}
              required
            >
              <option value="">Choose a provider</option>
              {providers.map((p) => (
                <option key={p.provider_id} value={p.provider_id}>
                  {p.name}
                  {p.consent_given ? '' : ' (no consent yet)'}
                </option>
              ))}
            </select>
          </label>

          <label>
            Description
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              maxLength={2000}
              rows={4}
            />
          </label>

          <label>
            Suburb
            <select value={form.suburb_id} onChange={(e) => set('suburb_id', e.target.value)}>
              <option value="">Not known</option>
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

        {/* 2. Who it suits */}
        <details open={wide}>
          <summary>Who it suits</summary>

          <label>
            Physical demand
            <select
              value={form.physical_demand}
              onChange={(e) => set('physical_demand', e.target.value)}
            >
              <option value="">Not known</option>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </label>

          <label>
            Sensory load (noise, crowds, lights)
            <select value={form.sensory_load} onChange={(e) => set('sensory_load', e.target.value)}>
              <option value="">Not known</option>
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </label>

          <label>
            Step-free access
            <select
              value={form.step_free_access}
              onChange={(e) => set('step_free_access', e.target.value as FormState['step_free_access'])}
            >
              <option value="">Not known</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>

          <label>
            Minimum age
            <input
              type="number"
              min={0}
              max={120}
              value={form.min_age}
              onChange={(e) => set('min_age', e.target.value)}
            />
          </label>

          <label>
            Maximum age
            <input
              type="number"
              min={0}
              max={120}
              value={form.max_age}
              onChange={(e) => set('max_age', e.target.value)}
            />
          </label>
        </details>

        {/* 3. Cost and getting there */}
        <details open={wide}>
          <summary>Cost and getting there</summary>

          <label>
            Cost per session ($)
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.cost_per_session}
              onChange={(e) => set('cost_per_session', e.target.value)}
            />
          </label>

          <fieldset>
            <legend>Getting there</legend>
            {ACTIVITY_TRANSPORT.map((t) => (
              <label key={t.value}>
                <input
                  type="checkbox"
                  checked={form.transport_options.includes(t.value)}
                  onChange={() => toggle('transport_options', t.value)}
                />
                {t.label}
              </label>
            ))}
          </fieldset>

          <label>
            Support workers
            <select
              value={form.support_worker_policy}
              onChange={(e) => set('support_worker_policy', e.target.value)}
            >
              <option value="">Not known</option>
              {SUPPORT_WORKER_POLICY.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
        </details>

        {/* 4. When it runs */}
        <details open={wide}>
          <summary>When it runs</summary>

          {form.sessions.length === 0 && <p>No sessions added yet.</p>}

          <ul>
            {form.sessions.map((s, i) => (
              <li key={i}>
                <fieldset>
                  <legend>Session {i + 1}</legend>
                  <label>
                    Day
                    <select value={s.day} onChange={(e) => setSession(i, 'day', e.target.value)}>
                      {DAYS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Starts
                    <input
                      type="time"
                      value={s.start_time}
                      onChange={(e) => setSession(i, 'start_time', e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Ends
                    <input
                      type="time"
                      value={s.end_time}
                      onChange={(e) => setSession(i, 'end_time', e.target.value)}
                      required
                    />
                  </label>
                  {canEdit && (
                    <button type="button" onClick={() => removeSession(i)}>
                      Remove session {i + 1}
                    </button>
                  )}
                </fieldset>
              </li>
            ))}
          </ul>

          {canEdit && (
            <button type="button" onClick={addSession}>
              Add session
            </button>
          )}
        </details>

        {/* 5. Interests */}
        <details open={wide}>
          <summary>Interests</summary>
          <fieldset>
            <legend>Interests this activity suits</legend>
            {tags.map((t) => (
              <label key={t.tag_id}>
                <input
                  type="checkbox"
                  checked={form.tags.includes(t.tag_id)}
                  onChange={() => toggle('tags', t.tag_id)}
                />
                {t.name}
              </label>
            ))}
          </fieldset>
        </details>

        {/* 6. Checked with the provider */}
        <details open={wide}>
          <summary>Checked with the provider</summary>
          <label>
            Date the details were last checked
            <input
              type="date"
              value={form.checked_at}
              onChange={(e) => set('checked_at', e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <p>Setting a new date records you as the person who checked.</p>
        </details>
      </fieldset>

      {error && <p role="alert">{error}</p>}

      {canEdit && (
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : id ? 'Save changes' : 'Add activity'}
        </button>
      )}
    </form>
  )
}