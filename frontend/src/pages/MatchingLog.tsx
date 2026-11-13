import { useEffect, useState } from 'react'
import type { MatchingLogEntry } from '../lib/types'
import { api, ApiError } from '../lib/api'
import './MatchingLog.css'


// Show a date and time
function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export default function MatchingLog() {
    const [entries, setEntries] = useState<MatchingLogEntry[] | null>(null)
    const [error, setError] = useState<string>()


    // Load the log once when the page opens
    useEffect(() => {
        api<MatchingLogEntry[]>('/matching-log')
        .then(setEntries)
        .catch((e) =>
            setError(e instanceof ApiError ? e.message : "Can't reach the server. Try again."),
        )
    }, [])
    
    return(
    <section>
        <h1>Matching log</h1>
        {error && <p role="alert">{error}</p>}
        {!error && entries === null && <p role="status">Loading matching log...</p>}
        {entries?.length === 0 && <p>No matches logged yet.</p>}


        {entries && entries.length > 0 && (
            <div className="log-table-wrap">
                <table className="log-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Result</th>
                            <th>Who</th>
                            <th>Response time (ms)</th>
                            <th>Candidates</th>
                            <th>Leads shown</th>
                            <th>Fallback shown</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((e) => (
                            <tr key={e.request_id}>
                                <td data-label="Date">{formatDate(e.requested_at)}</td>
                                <td data-label="Result">{e.result}</td>
                                <td data-label="Who">{e.requested_by_name ?? 'Unknown'}</td>
                                <td data-label="Response time (ms)">{e.response_ms ?? '-'}</td>
                                <td data-label="Candidates">{e.candidate_count ?? '-'}</td>
                                <td data-label="Leads shown">{e.leads_shown ?? '-'}</td>
                                <td data-label="Fallback shown">{e.fallback_shown ? 'Yes' : 'No'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}








    </section>
    )

}