import { useEffect, useState, type FormEvent } from 'react'
import { Search } from 'lucide-react'
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
    // SCRUM-129 fix 06 (hi-fi 09): a panel beside the results, every group open
    <form onSubmit={handleSubmit} className="catalogue-filters" aria-label="Search the catalogue">
      <div className="filter-scroll">
        <div className="filter-group">
          <label htmlFor="filter-q">Search</label>
          <div className="filter-search">
            <Search size={18} aria-hidden="true" />
            <input
              id="filter-q"
              value={get('q')}
              onChange={(e) => setOne('q', e.target.value)}
              maxLength={100}
              placeholder="Activity name"
            />
          </div>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-suburb">Suburb</label>
          <select
            id="filter-suburb"
            value={get('suburb_id')}
            onChange={(e) => setOne('suburb_id', e.target.value)}
          >
            <option value="">Any suburb</option>
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
        </div>

        <div className="filter-group">
          <label htmlFor="filter-cost">Cost per session up to ($)</label>
          <input
            id="filter-cost"
            type="number"
            min={0}
            step="0.01"
            value={get('max_cost')}
            onChange={(e) => setOne('max_cost', e.target.value)}
          />
        </div>

        <fieldset className="filter-group">
          <legend>Needs</legend>
          <label htmlFor="filter-physical">Physical demand up to</label>
          <select
            id="filter-physical"
            value={get('max_physical_demand')}
            onChange={(e) => setOne('max_physical_demand', e.target.value)}
          >
            <option value="">Any</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>

          <label htmlFor="filter-sensory">Sensory load up to</label>
          <select
            id="filter-sensory"
            value={get('max_sensory_load')}
            onChange={(e) => setOne('max_sensory_load', e.target.value)}
          >
            <option value="">Any</option>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>

          <label className="filter-check">
            <input
              type="checkbox"
              checked={get('sensory_hard_limit') === 'true'}
              onChange={(e) => setFlag('sensory_hard_limit', e.target.checked)}
            />
            Hard limit: hide activities above this sensory load
          </label>
          <label className="filter-check">
            <input
              type="checkbox"
              checked={get('needs_step_free') === 'true'}
              onChange={(e) => setFlag('needs_step_free', e.target.checked)}
            />
            Needs step-free access
          </label>
        </fieldset>

        <fieldset className="filter-group">
          <legend>Getting there</legend>
          {TRANSPORT.map((t) => (
            <label key={t.value} className="filter-check">
              <input
                type="checkbox"
                checked={has('transport', t.value)}
                onChange={() => toggle('transport', t.value)}
              />
              {t.label}
            </label>
          ))}
        </fieldset>

        <fieldset className="filter-group">
          <legend>Support and age</legend>
          <label htmlFor="filter-support">Support needed</label>
          <select
            id="filter-support"
            value={get('support_needed')}
            onChange={(e) => setOne('support_needed', e.target.value)}
          >
            <option value="">Any</option>
            {SUPPORT_NEEDED.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <label htmlFor="filter-birth-year">Birth year</label>
          <input
            id="filter-birth-year"
            type="number"
            min={1900}
            max={new Date().getFullYear()}
            value={get('birth_year')}
            onChange={(e) => setOne('birth_year', e.target.value)}
          />
        </fieldset>

        {/* Days across, times down, like the client form; each box has its own label */}
        <div className="filter-group">
          <table className="filter-times">
            <caption>When they're free</caption>
            <thead>
              <tr>
                <td />
                {DAYS.map((d) => (
                  <th key={d.value} scope="col">
                    <abbr title={d.label}>{d.label.slice(0, 2)}</abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLOTS.map((s) => (
                <tr key={s.value}>
                  <th scope="row">
                    <abbr title={s.label}>{s.label.slice(0, 3)}</abbr>
                  </th>
                  {DAYS.map((d) => {
                    const value = `${d.value}-${s.value}`
                    return (
                      <td key={value}>
                        <input
                          type="checkbox"
                          aria-label={`${d.label} ${s.label.toLowerCase()}`}
                          checked={has('available', value)}
                          onChange={() => toggle('available', value)}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <fieldset className="filter-group">
          <legend>Interests</legend>
          {tags.map((t) => (
            <label key={t.tag_id} className="filter-check">
              <input
                type="checkbox"
                checked={has('tags', t.tag_id)}
                onChange={() => toggle('tags', t.tag_id)}
              />
              {t.name}
            </label>
          ))}
        </fieldset>
      </div>

      {/* Stays at the bottom of the panel while the filters scroll */}
      <div className="filter-actions">
        <button type="submit" className="button-primary">
          Search
        </button>
        <button type="button" className="link-button" onClick={handleClear}>
          Clear all filters
        </button>
      </div>
    </form>
  )
}
