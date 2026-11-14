import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { Plus } from 'lucide-react'
import FormSection from '../components/FormSection'
import { api, ApiError } from '../lib/api'
import {
  ACTIVITY_TRANSPORT,
  CHECK_METHOD,
  DAYS,
  GROUP_SIZE,
  JOINING,
  LEVELS,
  STAFF_SUPPORT,
  SUPPORT_WORKER_POLICY,
} from '../lib/options'
import type { ActivityDetail, Day, Provider, Suburb, Tag } from '../lib/types'
import { useRole } from '../lib/useRole'
import { todayLocal } from '../lib/dates'
import './ClientForm.css' // form cards, segmented buttons, sticky Save bar (shared with the client form)
import './ActivityForm.css'

type SessionRow = { day: Day; start_time: string; end_time: string }
type YesNo = '' | 'yes' | 'no' // '' = not known

// What the form holds while you type. Numbers stay as text until saving;
// '' means "not known" and is saved as empty.
type FormState = {
  name: string
  provider_id: string
  description: string
  suburb_id: string
  street_address: string
  cost_per_session: string
  min_age: string
  max_age: string
  joining: string
  group_size: string
  sessions: SessionRow[]
  physical_demand: string
  physical_notes: string
  sensory_load: string
  sensory_notes: string
  transport_options: string[]
  step_free_access: YesNo
  bus_routes: string
  walk_from_stop_minutes: string
  support_worker_policy: string
  staff_support: string
  staff_experience: YesNo
  tags: string[]
  not_in_listing: string
  check_method: string
  checked_at: string
}

const EMPTY: FormState = {
  name: '',
  provider_id: '',
  description: '',
  suburb_id: '',
  street_address: '',
  cost_per_session: '',
  min_age: '',
  max_age: '',
  joining: '',
  group_size: '',
  sessions: [],
  physical_demand: '',
  physical_notes: '',
  sensory_load: '',
  sensory_notes: '',
  transport_options: [],
  step_free_access: '',
  bus_routes: '',
  walk_from_stop_minutes: '',
  support_worker_policy: '',
  staff_support: '',
  staff_experience: '',
  tags: [],
  not_in_listing: '',
  check_method: '',
  checked_at: '',
}

const NEW_SESSION: SessionRow = { day: 'mon', start_time: '10:00', end_time: '11:00' }
const NOT_KNOWN = { value: '', label: 'Not known' }
const YES_NO_NOT_KNOWN = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, NOT_KNOWN]

// Empty text becomes null ("not known"); numbers become numbers
const textOrNull = (v: string) => v.trim() || null
const numberOrNull = (v: string) => (v === '' ? null : Number(v))
const yesNo = (v: YesNo) => (v === '' ? null : v === 'yes')
const fromYesNo = (v: boolean | null): YesNo => (v === null ? '' : v ? 'yes' : 'no')

function toPayload(f: FormState) {
  return {
    name: f.name.trim(),
    provider_id: f.provider_id,
    description: textOrNull(f.description),
    suburb_id: f.suburb_id || null,
    street_address: textOrNull(f.street_address),
    cost_per_session: numberOrNull(f.cost_per_session),
    min_age: numberOrNull(f.min_age),
    max_age: numberOrNull(f.max_age),
    joining: f.joining || null,
    group_size: f.group_size || null,
    physical_demand: f.physical_demand || null,
    physical_notes: textOrNull(f.physical_notes),
    sensory_load: f.sensory_load || null,
    sensory_notes: textOrNull(f.sensory_notes),
    transport_options: f.transport_options,
    step_free_access: yesNo(f.step_free_access),
    bus_routes: textOrNull(f.bus_routes),
    walk_from_stop_minutes: numberOrNull(f.walk_from_stop_minutes),
    support_worker_policy: f.support_worker_policy || null,
    staff_support: f.staff_support || null,
    staff_experience: yesNo(f.staff_experience),
    not_in_listing: textOrNull(f.not_in_listing),
    check_method: f.check_method || null,
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
    street_address: a.street_address ?? '',
    cost_per_session: a.cost_per_session?.toString() ?? '',
    min_age: a.min_age?.toString() ?? '',
    max_age: a.max_age?.toString() ?? '',
    joining: a.joining ?? '',
    group_size: a.group_size ?? '',
    // The API sends "13:00:00"; a time box wants "13:00"
    sessions: a.sessions.map((s) => ({
      day: s.day,
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
    })),
    physical_demand: a.physical_demand ?? '',
    physical_notes: a.physical_notes ?? '',
    sensory_load: a.sensory_load ?? '',
    sensory_notes: a.sensory_notes ?? '',
    transport_options: a.transport_options,
    step_free_access: fromYesNo(a.step_free_access),
    bus_routes: a.bus_routes ?? '',
    walk_from_stop_minutes: a.walk_from_stop_minutes?.toString() ?? '',
    support_worker_policy: a.support_worker_policy ?? '',
    staff_support: a.staff_support ?? '',
    staff_experience: fromYesNo(a.staff_experience),
    tags: a.tags,
    not_in_listing: a.not_in_listing ?? '',
    check_method: a.check_method ?? '',
    checked_at: a.checked_at ?? '',
  }
}

// A group of radio buttons with a legend, one option per line (or in a row)
function RadioGroup(props: {
  legend: string
  name: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  segmented?: boolean // Low / Medium / High buttons, like the client form
}) {
  const { legend, name, options, value, onChange, segmented } = props
  return (
    <fieldset className="plain-fieldset">
      <legend>{legend}</legend>
      <div className={segmented ? 'segmented segmented-wide' : 'radio-list'}>
        {options.map((o) => (
          <label key={o.value || 'not-known'}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export default function ActivityFormPage() {
  const { id } = useParams()
  return <ActivityForm key={id ?? 'new'} id={id} />
}

// SCRUM-129 fix 08 (hi-fi 11): add or edit an activity. Coordinators only.
function ActivityForm({ id }: { id?: string }) {
  const navigate = useNavigate()
  const canEdit = useRole() === 'coordinator'

  const [form, setForm] = useState<FormState | null>(id ? null : EMPTY)
  const [savedName, setSavedName] = useState<string>() // for the breadcrumb
  const [savedCheck, setSavedCheck] = useState('') // the check date as loaded
  const [providers, setProviders] = useState<Provider[]>([])
  const [suburbs, setSuburbs] = useState<Suburb[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)

  // Wide screens show every card open; phones open and close them, About first
  const [wide] = useState(() => window.matchMedia('(min-width: 768px)').matches)

  // Load the dropdown and checkbox options
  useEffect(() => {
    Promise.all([api<Provider[]>('/providers'), api<Suburb[]>('/suburbs'), api<Tag[]>('/tags')])
      .then(([p, s, t]) => {
        setProviders(p)
        setSuburbs(s)
        setTags(t)
      })
      .catch(() => setError("Can't load the form options. Try again."))
  }, [])

  // Editing: load this activity
  useEffect(() => {
    if (!id) return
    api<ActivityDetail>(`/activities/${id}`)
      .then((a) => {
        setForm(fromDetail(a))
        setSavedName(a.name)
        setSavedCheck(a.checked_at ?? '')
      })
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
      // After editing, back to the activity's page (SCRUM-129 fix 07)
      navigate(id ? `/activities/${id}` : '/activities')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the server. Try again.")
    } finally {
      setSaving(false)
    }
  }

  // Archive: out of the catalogue, but saved leads still point to it
  async function archive() {
    if (!id || !form) return
    if (
      !window.confirm(
        `Archive ${form.name}? It leaves the catalogue and won't be suggested. Saved leads will show it as no longer listed.`,
      )
    )
      return
    setArchiving(true)
    setError(undefined)
    try {
      await api<void>(`/activities/${id}/archive`, { method: 'POST' })
      navigate('/activities')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the server. Try again.")
      setArchiving(false)
    }
  }

  // Workers can't add activities
  if (!id && !canEdit) return <p>Page not found.</p>
  // Only coordinators edit: everyone else reads the activity's page (SCRUM-129 fix 07)
  if (id && !canEdit) return <Navigate to={`/activities/${id}`} replace />

  const councils = [...new Set(suburbs.map((s) => s.territorial_authority))].sort()

  if (!form) {
    return error ? (
      <p role="alert">
        {error} <Link to="/activities">Back to the catalogue</Link>
      </p>
    ) : (
      <p>Loading activity…</p>
    )
  }

  // "I've confirmed these details are current" sets the check date to today
  const today = todayLocal()
  const confirmedToday = form.checked_at === today

  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <ol>
          <li>
            <Link to="/activities">Activity catalogue</Link>
          </li>
          {id && savedName && (
            <li>
              <Link to={`/activities/${id}`}>{savedName}</Link>
            </li>
          )}
          <li aria-current="page">{id ? 'Edit' : 'Add activity'}</li>
        </ol>
      </nav>

      <h1 className="form-title">
        {id ? 'Edit activity' : 'Add activity'}
        {id && <span lang="mi">Whakatika</span>}
      </h1>
      <p className="form-intro">
        Only list what you've confirmed. Anything you couldn't confirm goes under "Not in the
        listing".
      </p>

      <form onSubmit={handleSubmit} className="client-form">
        {/* Details */}
        <FormSection id="details-heading" title="Details" wide={wide} startOpen>
          <div className="form-two-col">
            <label>
              Activity name (required)
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
          </div>

          <label>
            Description
            <textarea
              rows={3}
              maxLength={2000}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </label>

          <div className="form-two-col">
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
            <label>
              Street address
              <input
                maxLength={200}
                value={form.street_address}
                onChange={(e) => set('street_address', e.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Cost per session
              <span className="money-input">
                <span aria-hidden="true">$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.cost_per_session}
                  onChange={(e) => set('cost_per_session', e.target.value)}
                />
              </span>
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
                placeholder="No limit"
                value={form.max_age}
                onChange={(e) => set('max_age', e.target.value)}
              />
            </label>
          </div>

          <div className="form-two-col">
            <RadioGroup
              legend="How people join"
              name="joining"
              options={[...JOINING, NOT_KNOWN]}
              value={form.joining}
              onChange={(v) => set('joining', v)}
            />
            <RadioGroup
              legend="Group size"
              name="group_size"
              options={[...GROUP_SIZE, NOT_KNOWN]}
              value={form.group_size}
              onChange={(v) => set('group_size', v)}
            />
          </div>
        </FormSection>

        {/* Days and times */}
        <FormSection id="times-heading" title="Days and times" mi="Ngā wā" wide={wide}>
          {form.sessions.length === 0 && <p className="field-hint">No sessions added yet.</p>}
          <ul className="session-list">
            {form.sessions.map((s, i) => (
              <li key={i}>
                <fieldset className="session-row">
                  <legend>Session {i + 1}</legend>
                  <label>
                    Day
                    <select value={s.day} onChange={(e) => setSession(i, 'day', e.target.value)}>
                      {DAYS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
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
                  <button type="button" className="link-button" onClick={() => removeSession(i)}>
                    Remove<span className="visually-hidden"> session {i + 1}</span>
                  </button>
                </fieldset>
              </li>
            ))}
          </ul>
          <button type="button" className="goal-add" onClick={addSession}>
            <Plus size={18} aria-hidden="true" />
            Add session
          </button>
        </FormSection>

        {/* Access */}
        <FormSection id="access-heading" title="Access" wide={wide}>
          <p className="field-hint">
            Same fields as a client profile, so the two can be matched. Leave a field as "Not known"
            if you couldn't confirm it.
          </p>

          <RadioGroup
            legend="Physical demand"
            name="physical_demand"
            options={[...LEVELS, NOT_KNOWN]}
            value={form.physical_demand}
            onChange={(v) => set('physical_demand', v)}
            segmented
          />
          <label>
            What's involved physically
            <textarea
              rows={2}
              maxLength={1000}
              value={form.physical_notes}
              onChange={(e) => set('physical_notes', e.target.value)}
            />
          </label>

          <RadioGroup
            legend="Sensory load (noise, crowds, lights)"
            name="sensory_load"
            options={[...LEVELS, NOT_KNOWN]}
            value={form.sensory_load}
            onChange={(v) => set('sensory_load', v)}
            segmented
          />
          <label>
            Sensory notes
            <textarea
              rows={2}
              maxLength={1000}
              value={form.sensory_notes}
              onChange={(e) => set('sensory_notes', e.target.value)}
            />
          </label>

          <div className="form-two-col">
            <fieldset className="plain-fieldset">
              <legend>Getting there</legend>
              <div className="radio-list">
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
              </div>
            </fieldset>
            <RadioGroup
              legend="Step-free access"
              name="step_free_access"
              options={YES_NO_NOT_KNOWN}
              value={form.step_free_access}
              onChange={(v) => set('step_free_access', v as YesNo)}
            />
          </div>

          <div className="form-row form-row-narrow">
            <label>
              Bus routes
              <input
                maxLength={100}
                placeholder="e.g. 2, 3"
                value={form.bus_routes}
                onChange={(e) => set('bus_routes', e.target.value)}
              />
            </label>
            <label>
              Walk from stop (min)
              <input
                type="number"
                min={0}
                max={180}
                value={form.walk_from_stop_minutes}
                onChange={(e) => set('walk_from_stop_minutes', e.target.value)}
              />
            </label>
          </div>

          <div className="form-three-col">
            <RadioGroup
              legend="Support workers"
              name="support_worker_policy"
              options={[...SUPPORT_WORKER_POLICY, NOT_KNOWN]}
              value={form.support_worker_policy}
              onChange={(v) => set('support_worker_policy', v)}
            />
            <RadioGroup
              legend="Staff at the activity"
              name="staff_support"
              options={[...STAFF_SUPPORT, NOT_KNOWN]}
              value={form.staff_support}
              onChange={(v) => set('staff_support', v)}
            />
            <RadioGroup
              legend="Staff have disability experience"
              name="staff_experience"
              options={YES_NO_NOT_KNOWN}
              value={form.staff_experience}
              onChange={(v) => set('staff_experience', v as YesNo)}
            />
          </div>
        </FormSection>

        {/* Interests */}
        <FormSection
          id="interests-heading"
          title="Interests this activity suits"
          mi="Ngā aronga"
          wide={wide}
        >
          <fieldset className="plain-fieldset">
            <legend className="visually-hidden">Interests this activity suits</legend>
            <div className="check-columns">
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
            </div>
          </fieldset>
        </FormSection>

        {/* Not in the listing: what support workers should ask about */}
        <FormSection id="not-listed-heading" title="Not in the listing" wide={wide}>
          <p className="field-hint" id="not-listed-hint">
            What you couldn't confirm. Workers see this as something to ask the provider.
          </p>
          <label>
            <span className="visually-hidden">Not in the listing</span>
            <textarea
              rows={3}
              maxLength={1000}
              aria-describedby="not-listed-hint"
              value={form.not_in_listing}
              onChange={(e) => set('not_in_listing', e.target.value)}
            />
          </label>
        </FormSection>

        {/* How these details were checked */}
        <FormSection id="checked-heading" title="How these details were checked" wide={wide}>
          <RadioGroup
            legend="Check method"
            name="check_method"
            options={[...CHECK_METHOD, { value: '', label: 'Not recorded' }]}
            value={form.check_method}
            onChange={(v) => set('check_method', v)}
            segmented
          />
          <label className="date-checked">
            Date checked
            <input
              type="date"
              value={form.checked_at}
              onChange={(e) => set('checked_at', e.target.value)}
              max={today}
              aria-describedby="checked-hint"
            />
          </label>
          <p className="field-hint" id="checked-hint">
            Setting a new date records you as the person who checked.
          </p>
          <label className="confirm-strip">
            <input
              type="checkbox"
              checked={confirmedToday}
              onChange={(e) => set('checked_at', e.target.checked ? today : savedCheck)}
            />
            I've confirmed these details are current (sets the date to today)
          </label>
        </FormSection>

        {error && <p role="alert">{error}</p>}

        {/* Archive on the left; Cancel and Save on the right, in the sticky bar */}
        <div className="form-actions">
          {id && (
            <button
              type="button"
              className="link-button archive-button"
              onClick={archive}
              disabled={archiving}
            >
              {archiving ? 'Archiving…' : 'Archive activity'}
            </button>
          )}
          <Link to={id ? `/activities/${id}` : '/activities'} className="button button-outline">
            Cancel
          </Link>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : id ? 'Save activity' : 'Add activity'}
          </button>
        </div>
      </form>
    </>
  )
}
