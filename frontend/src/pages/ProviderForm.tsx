import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import type { Provider } from '../lib/types'
import { todayLocal } from '../lib/dates'

// What the form holds while you type. Empty boxes are '' until saving.
type FormState = {
  name: string
  contact_email: string
  contact_phone: string
  website: string
  consent_given: boolean
  consent_date: string
}

const EMPTY: FormState = {
  name: '',
  contact_email: '',
  contact_phone: '',
  website: '',
  consent_given: false,
  consent_date: '',
}

// Empty boxes become null, so the database stores "not known" rather than ""
function toPayload(f: FormState) {
  return {
    name: f.name.trim(),
    contact_email: f.contact_email.trim() || null,
    contact_phone: f.contact_phone.trim() || null,
    website: f.website.trim() || null,
    consent_given: f.consent_given,
    consent_date: f.consent_given ? f.consent_date || null : null,
  }
}

function fromProvider(p: Provider): FormState {
  return {
    name: p.name,
    contact_email: p.contact_email ?? '',
    contact_phone: p.contact_phone ?? '',
    website: p.website ?? '',
    consent_given: p.consent_given,
    consent_date: p.consent_date ?? '',
  }
}

// key={...} gives each address a fresh form (same as ClientForm)
export default function ProviderFormPage() {
  const { id } = useParams()
  return <ProviderForm key={id ?? 'new'} id={id} />
}

function ProviderForm({ id }: { id?: string }) {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState | null>(id ? null : EMPTY)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  // Editing: load this provider and fill the form
  useEffect(() => {
    if (!id) return
    api<Provider>(`/providers/${id}`)
      .then((p) => setForm(fromProvider(p)))
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? 'Provider not found.'
            : "Can't load this provider. Try again.",
        ),
      )
  }, [id])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    setError(undefined)
    try {
      await api<Provider>(id ? `/providers/${id}` : '/providers', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(toPayload(form)),
      })
      navigate('/providers')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the server. Try again.")
    } finally {
      setSaving(false)
    }
  }

  if (!form) {
    return error ? (
      <p role="alert">
        {error} <Link to="/providers">Back to providers</Link>
      </p>
    ) : (
      <p>Loading provider…</p>
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>{id ? 'Edit provider' : 'Add provider'}</h1>
      <Link to="/providers">Back to providers</Link>

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
        Email
        <input
          type="email"
          value={form.contact_email}
          onChange={(e) => set('contact_email', e.target.value)}
          maxLength={254}
        />
      </label>

      <label>
        Phone
        <input
          type="tel"
          value={form.contact_phone}
          onChange={(e) => set('contact_phone', e.target.value)}
          maxLength={30}
        />
      </label>

      <label>
        Website
        <input
          type="url"
          placeholder="https://"
          value={form.website}
          onChange={(e) => set('website', e.target.value)}
          maxLength={500}
        />
      </label>

      <fieldset>
        <legend>Consent to be listed</legend>
        <label>
          <input
            type="checkbox"
            checked={form.consent_given}
            onChange={(e) => set('consent_given', e.target.checked)}
          />
          The provider agreed to be listed in the catalogue
        </label>

        {form.consent_given && (
          <label>
            Date consent was given (required)
            <input
              type="date"
              value={form.consent_date}
              onChange={(e) => set('consent_date', e.target.value)}
              max={todayLocal()}
              required
            />
          </label>
        )}
      </fieldset>

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : id ? 'Save changes' : 'Add provider'}
      </button>
    </form>
  )
}
