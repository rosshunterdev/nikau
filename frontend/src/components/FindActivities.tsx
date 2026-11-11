import { useState } from 'react'
import { Link } from 'react-router'
import { api, ApiError } from '../lib/api'
import { clientFilters } from '../lib/catalogueFilters'
import type { ClientDetail, FindActivitiesResponse, Lead, MatchLead } from '../lib/types'
import Why from './Why'

type Props = {
  client: ClientDetail // as last saved
  onSaved: () => void // a lead was saved, so the saved leads list should reload
}

// SCRUM-112: run AI matching for a client, show the leads with their explanations,
// save them, and fall back to the catalogue when matching can't help.
export default function FindActivities({ client, onSaved }: Props) {
  const [match, setMatch] = useState<FindActivitiesResponse>()
  const [finding, setFinding] = useState(false)
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState<Set<string>>(new Set()) // activity ids already saved
  const [saving, setSaving] = useState<string>() // activity id being saved
  const [saveMessage, setSaveMessage] = useState<string>()

  const catalogueLink = `/activities?client=${client.client_id}&${clientFilters(client)}`
    // Nothing to match on yet: no interests and no goals (SCRUM-94)
  const noInterests = client.interests.length === 0 && client.goals.length === 0

  async function find() {
    setFinding(true)
    setError(undefined)
    setSaveMessage(undefined)
    setMatch(undefined)
    try {
      // Both run at once. The saved leads are a nice-to-have: if only they fail,
      // still show the match (saving an already-saved lead shows "Saved" anyway, via 409)
      const [matchRes, leadsRes] = await Promise.allSettled([
        api<FindActivitiesResponse>(`/clients/${client.client_id}/match`, { method: 'POST' }),
        api<Lead[]>(`/clients/${client.client_id}/leads`),
      ])
      if (matchRes.status === 'rejected') throw matchRes.reason
      setSaved(
        leadsRes.status === 'fulfilled'
          ? new Set(leadsRes.value.map((l) => l.activity_id))
          : new Set(),
      )
      setMatch(matchRes.value)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Can't reach the server. Try again.")
    } finally {
      setFinding(false)
    }
  }

  async function save(lead: MatchLead) {
    if (!match) return
    setSaving(lead.activity_id)
    setSaveMessage(undefined)
    try {
      await api<Lead>(`/clients/${client.client_id}/leads`, {
        method: 'POST',
        body: JSON.stringify({
          activity_id: lead.activity_id,
          source: 'ai_match',
          match_request_id: match.request_id,
          why_fits: lead.why_fits,
          why_doesnt_cover: lead.why_doesnt_cover,
          why_ask: lead.why_ask,
        }),
      })
      setSaved((s) => new Set(s).add(lead.activity_id))
      setSaveMessage(`Saved ${lead.activity_name} for ${client.preferred_name}.`)
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already saved (e.g. from the catalogue): show it as saved, not as an error
        setSaved((s) => new Set(s).add(lead.activity_id))
        setSaveMessage(`${lead.activity_name} is already saved for ${client.preferred_name}.`)
      } else {
        setSaveMessage(err instanceof ApiError ? err.message : "Can't reach the server. Try again.")
      }
    } finally {
      setSaving(undefined)
    }
  }

  return (
    <section id="find-activities" aria-labelledby="find-activities-heading">
      {/* tabIndex -1: the page can move focus here when you arrive from "Find activities" */}
      <h2 id="find-activities-heading" tabIndex={-1}>
        Find activities
      </h2>
      <p>
        Suggestions for {client.preferred_name} from the activity catalogue, with the reasons
        for each. Check the details with the provider before booking.
      </p>

      {noInterests ? (
        <div role="status">
          <p>Add {client.preferred_name}'s interests or goals above and save to get suggestions.</p>
          <Link to={catalogueLink}>Search the catalogue for {client.preferred_name}</Link>
        </div>
      ) : (
        <>
          <button type="button" onClick={find} disabled={finding}>
            {finding ? 'Finding activities...' : match ? 'Find again' : 'Find activities'}
          </button>
          {finding && <p role="status">This can take up to 15 seconds.</p>}
        </>
      )}

      {error && <p role="alert">{error}</p>}

      {/* Anything other than success: say why, and offer the catalogue (the fallback) */}
      {match && match.result !== 'success' && (
        <div role="status">
          <p>{match.message}</p>
          <Link to={catalogueLink}>Search the catalogue for {client.preferred_name}</Link>
        </div>
      )}

      {match?.result === 'success' && (
        <>
          {saveMessage && <p role="status">{saveMessage}</p>}
          <ol>
            {match.leads.map((lead) => (
              <li key={lead.activity_id}>
                <h3>
                  <Link to={`/activities/${lead.activity_id}`}>{lead.activity_name}</Link>
                </h3>
                <Why title="Why it fits" items={lead.why_fits} />
                <Why title="What it doesn't cover" items={lead.why_doesnt_cover} />
                <Why title="Ask the provider" items={lead.why_ask} />

                {saved.has(lead.activity_id) ? (
                  <p>
                    Saved<span aria-hidden="true"> ✓</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => save(lead)}
                    disabled={saving === lead.activity_id}
                    aria-label={`Save as lead: ${lead.activity_name}`}
                  >
                    {saving === lead.activity_id ? 'Saving…' : 'Save as lead'}
                  </button>
                )}
              </li>
            ))}
          </ol>
          <p>
            Not what you need? <Link to={catalogueLink}>Search the catalogue</Link>
          </p>
        </>
      )}
    </section>
  )
}
