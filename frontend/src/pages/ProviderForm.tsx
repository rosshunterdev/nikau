import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import type { Provider } from '../lib/types'
import { todayLocal } from '../lib/dates'
import './ClientForm.css' // shared form look: cards, breadcrumb, Cancel and Save bar
import './Providers.css'

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
  const [savedName, setSavedName] = useState<string>() // for the title while you edit the name
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  // Editing: load this provider and fill the form
  useEffect(() => {
    if (!id) return
    api<Provider>(`/providers/${id}`)
      .then((p) => {
        setForm(fromProvider(p))
        setSavedName(p.name)
      })
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

  // SCRUM-129 fix 09: same look as the client form (cards, Cancel and Save at the bottom)
  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <ol>
          <li>
            <Link to="/providers">Providers</Link>
          </li>
          <li aria-current="page">{id ? `Edit ${savedName ?? 'provider'}` : 'Add provider'}</li>
        </ol>
      </nav>

      <h1 className="form-title">
        {id && savedName ? `Edit provider: ${savedName}` : 'Add provider'}
        {id && <span lang="mi">Whakatika</span>}
      </h1>
      <p className="form-intro">Contact details are stored here once, not on each activity.</p>

      <form onSubmit={handleSubmit} className="client-form">
        <section className="form-card" aria-labelledby="provider-details-heading">
          <h2 id="provider-details-heading" className="form-card-heading">
            Provider details
          </h2>
          <label>
            Name (required)
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
              maxLength={200}
            />
          </label>

          <div className="form-row">
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
              Email
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => set('contact_email', e.target.value)}
                maxLength={254}
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
          </div>
        </section>

        <section className="form-card" aria-labelledby="provider-consent-heading">
          <h2 id="provider-consent-heading" className="form-card-heading">
            Listing consent
          </h2>
          <label className="provider-consent-check">
            <input
              type="checkbox"
              checked={form.consent_given}
              onChange={(e) => set('consent_given', e.target.checked)}
            />
            The provider agreed to be listed in the catalogue
          </label>

          {form.consent_given && (
            <label className="provider-consent-date">
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
        </section>

        {error && <p role="alert">{error}</p>}

        <div className="form-actions">
          <Link to="/providers" className="button button-outline">
            Cancel
          </Link>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : id ? 'Save changes' : 'Add provider'}
          </button>
        </div>
      </form>
    </>
  )
}
