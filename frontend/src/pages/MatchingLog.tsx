import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, Clock, Download, Minus, TriangleAlert } from 'lucide-react'
import type { MatchingLogEntry, MatchResult } from '../lib/types'
import { api, ApiError } from '../lib/api'
import './MatchingLog.css'

// SCRUM-129 fix 10 (hi-fi 13): response time and outcome of every matching request

const PAGE_SIZE = 20

const PERIODS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
]

const CALLED_AS: Record<string, string> = {
  http: 'Separate service',
  direct: 'Direct call',
}

// How each result looks: words, icon and pill style
const RESULTS: Record<MatchResult, { label: string; icon: ReactNode; style: string }> = {
  success: { label: 'Succeeded', icon: <Check size={14} />, style: 'result-ok' },
  no_good_fit: { label: 'No good fit', icon: <Minus size={14} />, style: 'result-none' },
  no_candidates: { label: 'No candidates', icon: <Minus size={14} />, style: 'result-none' },
  timeout: { label: 'Timed out', icon: <Clock size={14} />, style: 'result-failed' },
  error: { label: 'Error', icon: <TriangleAlert size={14} />, style: 'result-failed' },
  invalid_output: {
    label: 'Unreadable reply',
    icon: <TriangleAlert size={14} />,
    style: 'result-failed',
  },
}

// "6 Nov, 10:42 am"
function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-NZ', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// "7f3a…c21e": enough to tell requests apart; the full ID is in the CSV
function shortId(id: string) {
  return `${id.slice(0, 4)}…${id.slice(-4)}`
}

// Middle value of the response times we have, in milliseconds
function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// Every filtered row as a CSV file, built in the browser
function downloadCsv(rows: MatchingLogEntry[]) {
  const header = [
    'Time',
    'Request ID',
    'Called as',
    'Response time (ms)',
    'Model time (ms)',
    'Result',
    'Candidates',
    'Dropped',
    'Leads shown',
    'Fallback shown',
  ]
  const lines = rows.map((e) => [
    e.requested_at,
    e.request_id,
    e.called_as ? CALLED_AS[e.called_as] : '',
    e.response_ms ?? '',
    e.model_ms ?? '',
    RESULTS[e.result].label,
    e.candidate_count ?? '',
    e.dropped_count ?? '',
    e.leads_shown ?? '',
    e.fallback_shown ? 'Yes' : 'No',
  ])
  // Quote every value, so commas inside a value don't break the columns
  const csv = [header, ...lines]
    .map((line) => line.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `matching-log-${new Date().toLocaleDateString('en-CA')}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export default function MatchingLog() {
  const [days, setDays] = useState(7)
  const [calledAs, setCalledAs] = useState('all')
  const [result, setResult] = useState('all')
  const [entries, setEntries] = useState<MatchingLogEntry[] | null>(null)
  const [error, setError] = useState<string>()
  const [showCount, setShowCount] = useState(PAGE_SIZE)
  const firstNewRow = useRef<HTMLTableRowElement>(null)

  // Load the chosen period. Called as and Result filter in the browser.
  // (Changing the period clears the old rows first: see choosePeriod)
  useEffect(() => {
    let current = true
    api<MatchingLogEntry[]>(`/matching-log?days=${days}`)
      .then((rows) => current && setEntries(rows))
      .catch(
        (e) =>
          current &&
          setError(e instanceof ApiError ? e.message : "Can't reach the server. Try again."),
      )
    return () => {
      current = false
    }
  }, [days])

  // After Show more, move focus to the first new row (keyboard and screen reader users),
  // same as the catalogue
  const focusAfterMore = useRef(false)
  useEffect(() => {
    if (focusAfterMore.current) {
      firstNewRow.current?.focus()
      focusAfterMore.current = false
    }
  }, [showCount])

  const filtered = (entries ?? []).filter(
    (e) =>
      (calledAs === 'all' || e.called_as === calledAs) && (result === 'all' || e.result === result),
  )
  const shown = filtered.slice(0, showCount)

  // Totals for the filtered rows
  const succeeded = filtered.filter((e) => e.result === 'success').length
  const percent = filtered.length ? Math.round((succeeded / filtered.length) * 100) : null
  const medianMs = median(filtered.flatMap((e) => (e.response_ms === null ? [] : [e.response_ms])))
  const fallbacks = filtered.filter((e) => e.fallback_shown).length

  // A new filter starts again at the first 20
  function changeFilter(set: (value: string) => void, value: string) {
    set(value)
    setShowCount(PAGE_SIZE)
  }

  function choosePeriod(value: number) {
    setEntries(null) // shows "Loading…" until the new period arrives
    setError(undefined)
    setDays(value)
    setShowCount(PAGE_SIZE)
  }

  function showMore() {
    focusAfterMore.current = true
    setShowCount((n) => n + PAGE_SIZE)
  }

  return (
    <section>
      <div className="log-header">
        <div>
          <h1 className="page-title">Matching log</h1>
          <p className="log-intro">
            Response time and outcome of every matching request. No client details are stored here.
          </p>
        </div>
        <button
          type="button"
          className="button-outline"
          onClick={() => downloadCsv(filtered)}
          disabled={filtered.length === 0}
        >
          <Download size={18} aria-hidden="true" />
          Download CSV
        </button>
      </div>

      <div className="log-filters">
        <label>
          Period
          <select value={days} onChange={(e) => choosePeriod(Number(e.target.value))}>
            {PERIODS.map((p) => (
              <option key={p.days} value={p.days}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          How matching was called
          <select value={calledAs} onChange={(e) => changeFilter(setCalledAs, e.target.value)}>
            <option value="all">All</option>
            {Object.entries(CALLED_AS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Result
          <select value={result} onChange={(e) => changeFilter(setResult, e.target.value)}>
            <option value="all">All</option>
            {Object.entries(RESULTS).map(([value, r]) => (
              <option key={value} value={value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p role="alert">{error}</p>}
      {!error && entries === null && <p role="status">Loading matching log…</p>}

      {entries && (
        <>
          <dl className="log-stats">
            <div className="log-stat">
              <dt>Requests</dt>
              <dd>{filtered.length}</dd>
            </div>
            <div className="log-stat">
              <dt>Succeeded</dt>
              <dd>
                {succeeded}
                {percent !== null && <span className="log-stat-small"> {percent}%</span>}
              </dd>
            </div>
            <div className="log-stat">
              <dt>Median response time</dt>
              <dd>{medianMs === null ? '–' : `${(medianMs / 1000).toFixed(1)} s`}</dd>
            </div>
            <div className="log-stat">
              <dt>Fallback shown</dt>
              <dd>{fallbacks}</dd>
            </div>
          </dl>

          {filtered.length === 0 ? (
            <p className="log-empty">No matching requests in this period.</p>
          ) : (
            <div
              className="table-scroll log-card"
              tabIndex={0}
              role="region"
              aria-label="Matching requests"
            >
              <table className="log-table">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Request</th>
                    <th scope="col">Called as</th>
                    <th scope="col" className="log-number">
                      Response time
                    </th>
                    <th scope="col">Result</th>
                    <th scope="col" className="log-number">
                      Leads shown
                    </th>
                    <th scope="col">Fallback shown</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e, i) => {
                    const r = RESULTS[e.result]
                    return (
                      <tr
                        key={e.request_id}
                        ref={i === showCount - PAGE_SIZE ? firstNewRow : undefined}
                        tabIndex={i === showCount - PAGE_SIZE ? -1 : undefined}
                      >
                        <td data-label="Time">{formatTime(e.requested_at)}</td>
                        <td data-label="Request">
                          <code title={e.request_id}>{shortId(e.request_id)}</code>
                        </td>
                        <td data-label="Called as">{e.called_as ? CALLED_AS[e.called_as] : '–'}</td>
                        <td data-label="Response time" className="log-number">
                          {e.response_ms === null
                            ? '–'
                            : `${e.response_ms.toLocaleString('en-NZ')} ms`}
                        </td>
                        <td data-label="Result">
                          <span className={`result-pill ${r.style}`}>
                            <span aria-hidden="true">{r.icon}</span>
                            {r.label}
                          </span>
                        </td>
                        <td data-label="Leads shown" className="log-number">
                          {e.leads_shown ?? '–'}
                        </td>
                        <td
                          data-label="Fallback shown"
                          className={e.fallback_shown ? 'log-yes' : undefined}
                        >
                          {e.fallback_shown ? 'Yes' : 'No'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="log-footer">
              <p role="status" className="log-showing">
                Showing {shown.length} of {filtered.length}
              </p>
              {shown.length < filtered.length && (
                <button type="button" className="button-outline" onClick={showMore}>
                  Show more
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
