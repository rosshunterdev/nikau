import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Check, RefreshCw, TriangleAlert } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { clientFilters } from '../lib/catalogueFilters'
import type { ClientDetail, FindActivitiesResponse, Lead, MatchLead } from '../lib/types'
import Why from './Why'
import './FindActivities.css'

type Props = {
  client: ClientDetail // as last saved
}

// What the page is showing (hi-fi 05–07, SCRUM-91)
type View =
  | { kind: 'finding' }
  | { kind: 'suggestions'; match: FindActivitiesResponse }
  | { kind: 'no_fit'; nothingReachable: boolean } // 07
  | { kind: 'unavailable' } // 06: matching failed or the server couldn't be reached

// SCRUM-112 / SCRUM-91: run AI matching as soon as the page opens, then show the
// suggestions, "no good fit", or the catalogue fallback when matching is unavailable.
export default function FindActivities({ client }: Props) {
  const [view, setView] = useState<View>({ kind: 'finding' })
  const [saved, setSaved] = useState<Set<string>>(new Set()) // activity ids already saved
  const [saving, setSaving] = useState<string>() // activity id being saved
  const [saveMessage, setSaveMessage] = useState<string>()
  // How many times matching has run on this page. When a retry fails just as fast,
  // this lets the page say it really did try again.
  const [tries, setTries] = useState(0)

  const name = client.preferred_name
  const catalogueLink = `/activities?client=${client.client_id}&${clientFilters(client)}`
  // Nothing to match on yet: no interests and no goals (SCRUM-94, SCRUM-125)
  const noInterests = client.interests.length === 0 && client.goals.length === 0

  const find = useCallback(async () => {
    setView({ kind: 'finding' })
    setSaveMessage(undefined)
    setTries((t) => t + 1)
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
      const match = matchRes.value
      if (match.result === 'success') setView({ kind: 'suggestions', match })
      else if (match.result === 'no_good_fit') setView({ kind: 'no_fit', nothingReachable: false })
      else if (match.result === 'no_candidates') setView({ kind: 'no_fit', nothingReachable: true })
      else setView({ kind: 'unavailable' }) // timeout, error, invalid_output
    } catch {
      setView({ kind: 'unavailable' })
    }
  }, [client.client_id])

  // Run once when the page opens. The ref stops React's development double-run
  // from asking the AI twice (two Gemini calls, two log rows).
  const started = useRef(false)
  useEffect(() => {
    if (noInterests || started.current) return
    started.current = true
    void find()
  }, [find, noInterests])

  async function save(match: FindActivitiesResponse, lead: MatchLead) {
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
      setSaveMessage(`Saved ${lead.activity_name} for ${name}.`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already saved (e.g. from the catalogue): show it as saved, not as an error
        setSaved((s) => new Set(s).add(lead.activity_id))
        setSaveMessage(`${lead.activity_name} is already saved for ${name}.`)
      } else {
        setSaveMessage(err instanceof ApiError ? err.message : "Can't reach the server. Try again.")
      }
    } finally {
      setSaving(undefined)
    }
  }

  // Nothing to match on: say what to do instead of asking the AI
  if (noInterests) {
    return (
      <div className="find-panel">
        <h2>Add interests or goals first</h2>
        <p>
          Nīkau matches on {name}'s goals and interests. Add at least one to {name}'s profile to
          get suggestions.
        </p>
        <div className="profile-actions">
          <Link to={`/clients/${client.client_id}/edit`} className="button button-primary">
            Edit profile
          </Link>
          <Link to={catalogueLink} className="button button-outline">
            Search the catalogue for {name}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Screen readers hear each change of state; the visible content follows below */}
      <p role="status" className="visually-hidden">
        {view.kind === 'finding' && `Finding activities for ${name}.`}
        {view.kind === 'suggestions' &&
          `${view.match.leads.length} suggested ${view.match.leads.length === 1 ? 'activity' : 'activities'} for ${name}.`}
        {view.kind === 'no_fit' && `No good fit for ${name} this time.`}
        {view.kind === 'unavailable' &&
          (tries > 1
            ? 'Tried again. Suggestions still aren\'t available.'
            : "Suggestions aren't available right now.")}
      </p>

      {view.kind === 'finding' && (
        <div className="find-panel find-loading" aria-hidden="true">
          <span className="find-spinner" />
          <p>
            <strong>Finding activities for {name}…</strong>
            <br />
            Checking the catalogue against {name}'s needs. This can take up to 15 seconds.
          </p>
        </div>
      )}

      {/* 06: matching failed. The catalogue still works, with the client's needs as filters */}
      {view.kind === 'unavailable' && (
        <div className="find-warning">
          <TriangleAlert size={28} aria-hidden="true" />
          <div>
            <h2>Suggestions aren't available right now</h2>
            <p>
              The matching service didn't respond. You can still search the catalogue: {name}'s
              access needs are already set as filters. Results there aren't ranked or explained.
            </p>
            {tries > 1 && (
              <p className="find-retry-note">
                Tried again ({tries - 1} {tries === 2 ? 'retry' : 'retries'}). Still not available.
              </p>
            )}
            <div className="profile-actions">
              <button type="button" className="button-primary" onClick={find}>
                <RefreshCw size={18} aria-hidden="true" />
                Try suggestions again
              </button>
              <Link to={catalogueLink} className="button button-outline">
                Search the catalogue for {name}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 07: matching worked, but nothing fits well enough. A real answer, not an error */}
      {view.kind === 'no_fit' && (
        <>
          <div className="find-panel find-empty">
            <h2>No good fit for {name} this time</h2>
            <p>
              {view.nothingReachable
                ? `No activities in the catalogue match ${name}'s access needs, cost and times yet.`
                : `Nīkau checked the activities ${name} can reach and afford, but none fit ${name}'s goals or interests well enough to suggest.`}{' '}
              That's a real answer, not an error.
            </p>
          </div>

          <h2>What you can do next</h2>
          <ul className="find-next">
            <li>
              <h3>Browse the catalogue</h3>
              <p>
                {name}'s access needs are already set as filters. You can widen them to see near
                misses.
              </p>
              <Link to={catalogueLink} className="button button-primary">
                Search the catalogue for {name}
              </Link>
            </li>
            <li>
              <h3>Check {name}'s profile</h3>
              <p>New goals or interests can change what fits.</p>
              <Link to={`/clients/${client.client_id}/edit`} className="button button-outline">
                Edit profile
              </Link>
            </li>
            <li className="find-next-note">
              <h3>Know of something?</h3>
              <p>
                Coordinators add activities to the catalogue. Tell yours about a group that might
                suit {name}.
              </p>
            </li>
          </ul>
          <div className="profile-actions">
            <button type="button" className="button-outline" onClick={find}>
              <RefreshCw size={18} aria-hidden="true" />
              Find again
            </button>
          </div>
        </>
      )}

      {/* 05: the suggestions, each with the AI's reasons */}
      {view.kind === 'suggestions' && (
        <>
          <div className="profile-actions">
            <Link to={catalogueLink} className="button button-outline">
              Browse catalogue
            </Link>
            <button type="button" onClick={find}>
              <RefreshCw size={18} aria-hidden="true" />
              Find again
            </button>
          </div>

          {saveMessage && (
            <p className="find-saved-message">
              <Check size={18} aria-hidden="true" /> {saveMessage}
            </p>
          )}

          <ol className="find-leads">
            {view.match.leads.map((lead, i) => (
              <li key={lead.activity_id} className="find-lead">
                <div className="find-lead-head">
                  <span className="find-rank" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h2>
                    <Link to={`/activities/${lead.activity_id}`}>{lead.activity_name}</Link>
                  </h2>
                  {saved.has(lead.activity_id) ? (
                    <span className="find-saved">
                      <Check size={18} aria-hidden="true" /> Saved for {name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="button-outline"
                      onClick={() => save(view.match, lead)}
                      disabled={saving === lead.activity_id}
                      aria-label={`Save lead: ${lead.activity_name}`}
                    >
                      {saving === lead.activity_id ? 'Saving…' : 'Save lead'}
                    </button>
                  )}
                </div>

                <div className="find-why">
                  <p className="find-why-label">Why it was suggested · AI-written</p>
                  <div className="find-why-columns">
                    <div>
                      <Why title="Why it fits" items={lead.why_fits} />
                    </div>
                    <div>
                      <Why title="What it doesn't cover" items={lead.why_doesnt_cover} />
                    </div>
                    <div>
                      <Why title="Ask the provider" items={lead.why_ask} />
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <p className="find-footnote">
            Suggestions come from Nīkau's checked activity catalogue. The explanations are written
            by AI and can be wrong. Confirm details with the provider before booking. Not what you
            need? <Link to={catalogueLink}>Search the catalogue for {name}</Link>.
          </p>
        </>
      )}
    </>
  )
}
