import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Plus, X } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { DAYS, LEVELS, SLOTS, SUPPORT_NEEDED, TRANSPORT } from '../lib/options'
import type { ClientDetail, Suburb, Tag } from '../lib/types'
import './ClientForm.css'

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

// SCRUM-129: one part of the form. On wide screens it's an open card with a heading,
// like hi-fi 04, so nothing (including required fields) is hidden. On phones it's a
// section you can open and close, with only the first one open to start.
function FormSection(props: {
  id: string
  title: string
  mi?: string // te reo name under the heading
  wide: boolean
  startOpen?: boolean // phones only
  children: ReactNode
}) {
  const { id, title, mi, wide, startOpen, children } = props
  if (!wide) {
    return (
      <details className="form-card" open={startOpen}>
        <summary>{title}</summary>
        {children}
      </details>
    )
  }
  return (
    <section className="form-card" aria-labelledby={id}>
      <h2 id={id} className="form-card-heading">
        {title}
        {mi && <span lang="mi">{mi}</span>}
      </h2>
      {children}
    </section>
  )
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

  // The client as last saved: the heading and breadcrumb use this, not unsaved edits
  const [saved, setSaved] = useState<ClientDetail>()
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
      const result = await api<ClientDetail>(id ? `/clients/${id}` : '/clients', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(toPayload(form)),
      })
      // Back to the client's profile (SCRUM-117)
      navigate(`/clients/${result.client_id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the server. Try again.")
    } finally {
      setSaving(false)
    }
  }

  // Suburbs grouped by council (Wellington City, Hutt City...) for the dropdown
  const councils = [...new Set(suburbs.map((s) => s.territorial_authority))].sort()

  // "Sam's" / "Sam" in the labels when editing; "their" / "they" when adding
  const name = saved?.preferred_name
  const who = name ? `${name}'s` : 'their'
  const subject = name ?? 'they'

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
      {/* SCRUM-117: where you are, and which client you're editing */}
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <ol>
          <li>
            <Link to="/clients">Clients</Link>
          </li>
          {id && saved && (
            <li>
              <Link to={`/clients/${id}`}>{saved.preferred_name}</Link>
            </li>
          )}
          <li aria-current="page">{id ? 'Edit profile' : 'Add client'}</li>
        </ol>
      </nav>

      <h1 className="form-title">
        {id && saved ? `Edit profile: ${saved.preferred_name}` : 'Add client'}
        {id && <span lang="mi">Whakatika</span>}
      </h1>
      <p className="form-intro">
        Build this from {name ? `${name}'s` : 'their'} support plan. Record what affects which
        activities will work for {name ?? 'them'}.
      </p>

      <form onSubmit={handleSubmit} className="client-form">
        {/* About: name, birth year, suburb and travel range on one row */}
        <FormSection id="about-heading" title="About" wide={wide} startOpen>
          <div className="form-row">
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
                aria-describedby="birth-hint"
              />
              <span id="birth-hint" className="field-hint">
                Used for age limits on activities.
              </span>
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

            <label>
              Travel range (minutes)
              <input
                type="number"
                min={1}
                value={form.travel_range_minutes}
                onChange={(e) => set('travel_range_minutes', e.target.value)}
                aria-describedby="travel-hint"
              />
              <span id="travel-hint" className="field-hint">
                Not used for suggestions yet.
              </span>
            </label>
          </div>
        </FormSection>

        {/* Goals (SCRUM-94): up to 5, in the client's own words */}
        <FormSection id="goals-heading" title="Goals" mi="Ngā whāinga" wide={wide}>
          <p className="field-hint">In {who} words where you can. Up to {MAX_GOALS}.</p>
          {/* The position is the key: each input's text always comes from form.goals */}
          <ol className="goal-rows">
            {form.goals.map((goal, i) => (
              <li key={i}>
                <span className="goal-number" aria-hidden="true">
                  {i + 1}
                </span>
                <input
                  aria-label={`Goal ${i + 1}`}
                  value={goal}
                  maxLength={200}
                  onChange={(e) => setGoal(i, e.target.value)}
                />
                <button
                  type="button"
                  className="goal-remove"
                  onClick={() => removeGoal(i)}
                  aria-label={`Remove goal ${i + 1}`}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
          {form.goals.length < MAX_GOALS && (
            <button type="button" className="goal-add" onClick={addGoal}>
              <Plus size={18} aria-hidden="true" />
              Add goal
            </button>
          )}
        </FormSection>

        {/* Interests: the shared tags, in columns */}
        <FormSection id="interests-heading" title="Interests" mi="Ngā aronga" wide={wide}>
          <fieldset className="plain-fieldset">
            <legend>{name ? `What ${name} enjoys` : 'What they enjoy'}</legend>
            <div className="check-columns">
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
            </div>
          </fieldset>
        </FormSection>

        {/* Access and support needs: the same fields as the activity catalogue */}
        <FormSection
          id="needs-heading"
          title="Access and support needs"
          mi="Ngā matea tautoko"
          wide={wide}
        >
          <p className="field-hint">
            These use the same fields as the activity catalogue, so the two can be matched.
          </p>

          <fieldset className="plain-fieldset">
            <legend>Most physical activity {subject} can manage (required)</legend>
            <div className="segmented">
              {LEVELS.map((o) => (
                <label key={o.value}>
                  <input
                    type="radio"
                    name="max_physical_demand"
                    value={o.value}
                    checked={form.max_physical_demand === o.value}
                    onChange={() => set('max_physical_demand', o.value)}
                    required
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>

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

          <fieldset className="plain-fieldset">
            <legend>Most noise and busyness {subject} can manage (required)</legend>
            <div className="segmented">
              {LEVELS.map((o) => (
                <label key={o.value}>
                  <input
                    type="radio"
                    name="max_sensory_load"
                    value={o.value}
                    checked={form.max_sensory_load === o.value}
                    onChange={() => set('max_sensory_load', o.value)}
                    required
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="hard-limit">
            <input
              type="checkbox"
              checked={form.sensory_hard_limit}
              onChange={(e) => set('sensory_hard_limit', e.target.checked)}
            />
            <span>
              <strong>Hard limit.</strong> Leave out busier activities altogether, instead of
              showing them with a warning.
            </span>
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
            {name ? `How ${name} likes to take part` : 'How they like to take part'}
            <textarea
              rows={2}
              maxLength={1000}
              aria-describedby="notes-hint"
              value={form.participation_notes}
              onChange={(e) => set('participation_notes', e.target.value)}
            />
          </label>
          <p id="notes-hint" className="field-hint">
            {NOTES_HINT}
          </p>

          {/* Transport and support side by side */}
          <div className="form-two-col">
            <fieldset className="plain-fieldset">
              <legend>Transport {subject} can use</legend>
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

            <fieldset className="plain-fieldset">
              <legend>Support needed at the activity (required)</legend>
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
          </div>

          {/* Step-free and cost side by side */}
          <div className="form-two-col">
            <fieldset className="plain-fieldset">
              <legend>Needs step-free access</legend>
              <div className="inline-options">
                <label>
                  <input
                    type="radio"
                    name="needs_step_free"
                    checked={form.needs_step_free}
                    onChange={() => set('needs_step_free', true)}
                  />
                  Yes
                </label>
                <label>
                  <input
                    type="radio"
                    name="needs_step_free"
                    checked={!form.needs_step_free}
                    onChange={() => set('needs_step_free', false)}
                  />
                  No
                </label>
              </div>
            </fieldset>

            <label>
              Most {subject} can pay per session
              <span className="money-input">
                <span aria-hidden="true">$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.max_cost}
                  onChange={(e) => set('max_cost', e.target.value)}
                />
              </span>
            </label>
          </div>

          {/* Availability: days across, times of day down (hi-fi 04) */}
          <table className="availability-grid">
            <caption>{name ? `When ${name} is free` : "When they're free"}</caption>
            <thead>
              <tr>
                <td />
                {DAYS.map((d) => (
                  <th key={d.value} scope="col">
                    <abbr title={d.label}>{d.label.slice(0, 3)}</abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLOTS.map((s) => (
                <tr key={s.value}>
                  <th scope="row">{s.label}</th>
                  {DAYS.map((d) => {
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
        </FormSection>

        {error && <p role="alert">{error}</p>}

        {/* Cancel and Save at the bottom right, like the hi-fi */}
        <div className="form-actions">
          <Link to={id ? `/clients/${id}` : '/clients'} className="button button-outline">
            Cancel
          </Link>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : id ? 'Save profile' : 'Save client'}
          </button>
        </div>
      </form>
    </>
  )
}
