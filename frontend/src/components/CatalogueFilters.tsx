import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { filtersOnly } from '../lib/catalogueFilters'
import { DAYS, LEVELS, SLOTS, SUPPORT_NEEDED, TRANSPORT } from '../lib/options'
import type { Suburb, Tag } from '../lib/types'
 
type Props = {
  params: URLSearchParams
  onSearch: (params: URLSearchParams) => void
}
 
// The filter form. It keeps its own copy while you change things,
// and only updates the page address (and so the results) when you press Search.
export default function CatalogueFilters({ params, onSearch }: Props) {
  const [draft, setDraft] = useState(() => filtersOnly(params))
  const [suburbs, setSuburbs] = useState<Suburb[]>([])
  const [tags, setTags] = useState<Tag[]>([])
 
  useEffect(() => {
    Promise.all([api<Suburb[]>('/suburbs'), api<Tag[]>('/tags')])
      .then(([s, t]) => {
        setSuburbs(s)
        setTags(t)
      })
      .catch(() => {
        // The filters still work without the suburb and interest lists
      })
  }, [])
 
  // One value (text box, dropdown): empty removes the filter
  function setOne(key: string, value: string) {
    setDraft((d) => {
      const next = new URLSearchParams(d)
      if (value === '') next.delete(key)
      else next.set(key, value)
      return next
    })
  }
 
  // Yes/no filter: present only when ticked
  function setFlag(key: string, on: boolean) {
    setOne(key, on ? 'true' : '')
  }
 
  // Lists (transport, available, tags): tick adds the value, untick removes it
  function toggle(key: string, value: string) {
    setDraft((d) => {
      const next = new URLSearchParams(d)
      const values = next.getAll(key)
      next.delete(key)
      const updated = values.includes(value)
        ? values.filter((v) => v !== value)
        : [...values, value]
      for (const v of updated) next.append(key, v)
      return next
    })
  }
 
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onSearch(draft)
  }
 
  function handleClear() {
    setDraft(new URLSearchParams())
    onSearch(new URLSearchParams())
  }
 
  const get = (key: string) => draft.get(key) ?? ''
  const has = (key: string, value: string) => draft.getAll(key).includes(value)
  const councils = [...new Set(suburbs.map((s) => s.territorial_authority))].sort()
 
  return (
    <form onSubmit={handleSubmit} className="catalogue-filters" aria-label="Search the catalogue">
      <label>
        Name contains
        <input value={get('q')} onChange={(e) => setOne('q', e.target.value)} maxLength={100} />
      </label>
 
      <details>
        <summary>Needs</summary>
 
        <label>
          Physical demand up to
          <select
            value={get('max_physical_demand')}
            onChange={(e) => setOne('max_physical_demand', e.target.value)}
          >
            <option value="">Any</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </label>
 
        <label>
          Sensory load up to
          <select
            value={get('max_sensory_load')}
            onChange={(e) => setOne('max_sensory_load', e.target.value)}
          >
            <option value="">Any</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </label>
 
        <label>
          <input
            type="checkbox"
            checked={get('sensory_hard_limit') === 'true'}
            onChange={(e) => setFlag('sensory_hard_limit', e.target.checked)}
          />
          Hard limit: hide activities above this sensory load
        </label>
 
        <label>
          <input
            type="checkbox"
            checked={get('needs_step_free') === 'true'}
            onChange={(e) => setFlag('needs_step_free', e.target.checked)}
          />
          Needs step-free access
        </label>
 
        <label>
          Support needed
          <select
            value={get('support_needed')}
            onChange={(e) => setOne('support_needed', e.target.value)}
          >
            <option value="">Any</option>
            {SUPPORT_NEEDED.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
 
        <label>
          Birth year
          <input
            type="number"
            min={1900}
            max={new Date().getFullYear()}
            value={get('birth_year')}
            onChange={(e) => setOne('birth_year', e.target.value)}
          />
        </label>
 
        <label>
          Cost per session up to ($)
          <input
            type="number"
            min={0}
            step="0.01"
            value={get('max_cost')}
            onChange={(e) => setOne('max_cost', e.target.value)}
          />
        </label>
 
        <fieldset>
          <legend>Getting there</legend>
          {TRANSPORT.map((t) => (
            <label key={t.value}>
              <input
                type="checkbox"
                checked={has('transport', t.value)}
                onChange={() => toggle('transport', t.value)}
              />
              {t.label}
            </label>
          ))}
        </fieldset>
      </details>
 
      <details>
        <summary>When they're free</summary>
        <fieldset>
          <legend>Days and times</legend>
          {DAYS.map((d) =>
            SLOTS.map((s) => {
              const value = `${d.value}-${s.value}`
              return (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={has('available', value)}
                    onChange={() => toggle('available', value)}
                  />
                  {d.label} {s.label.toLowerCase()}
                </label>
              )
            }),
          )}
        </fieldset>
      </details>
 
      <details>
        <summary>Place and interests</summary>
 
        <label>
          Suburb
          <select value={get('suburb_id')} onChange={(e) => setOne('suburb_id', e.target.value)}>
            <option value="">Any</option>
            {councils.map((council) => (
              <optgroup key={council} label={council}>
                {suburbs
                  .filter((s) => s.territorial_authority === council)
                  .map((s) => (
                    <option key={s.suburb_id} value={s.suburb_id}>{s.name}</option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
 
        <fieldset>
          <legend>Interests</legend>
          {tags.map((t) => (
            <label key={t.tag_id}>
              <input
                type="checkbox"
                checked={has('tags', t.tag_id)}
                onChange={() => toggle('tags', t.tag_id)}
              />
              {t.name}
            </label>
          ))}
        </fieldset>
      </details>
 
      <button type="submit">Search</button>
      <button type="button" onClick={handleClear}>
        Clear filters
      </button>
    </form>
  )
}
