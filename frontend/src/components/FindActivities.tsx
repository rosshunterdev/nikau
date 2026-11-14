import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Check, Lock, RefreshCw, TriangleAlert } from 'lucide-react'
import { api, ApiError } from '../lib/api'
import { clientFilters } from '../lib/catalogueFilters'
import { formatDate } from '../lib/leads'
import { activityMeta } from '../lib/activityFormat'
import { LEVELS, SUPPORT_WORKER_POLICY } from '../lib/options'
import type {
  ClientDetail,
  FindActivitiesResponse,
  Lead,
  MatchLead,
} from '../lib/types'
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

// The first three suggestions show their reasons; the rest show them on request (hi-fi 05)
const OPEN_REASONS = 3

// The small grey tags under the name: levels and the support worker policy
function leadChips(lead: MatchLead) {
  const level = (value: string | null) =>
    LEVELS.find((l) => l.value === value)?.label.toLowerCase()
  const chips: string[] = []
  if (lead.physical_demand) chips.push(`Physical: ${level(lead.physical_demand)}`)
  if (lead.sensory_load) chips.push(`Sensory: ${level(lead.sensory_load)}`)
  const policy = SUPPORT_WORKER_POLICY.find((p) => p.value === lead.support_worker_policy)
  if (policy) chips.push(policy.label)
  return chips
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

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
  const editLink = `/clients/${client.client_id}/edit`
  const updated = formatDate(client.updated_at)
  // "3 goals · 4 interests · access and support needs" (leaves out a count of 0)
  const matchedOn = [
    client.goals.length > 0 && plural(client.goals.length, 'goal'),
    client.interests.length > 0 && plural(client.interests.length, 'interest'),
    'access and support needs',
  ]
    .filter(Boolean)
    .join(' · ')
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

  // Page heading (hi-fi 05–07): "Suggested activities" once there's an answer,
  // "Find activities" while finding, when unavailable, or before there's anything to match
  const answered = view.kind === 'suggestions' || view.kind === 'no_fit'
  const findAgain = (
    <button type="button" className="button-outline" onClick={find}>
      <RefreshCw size={18} aria-hidden="true" />
      Find again
    </button>
  )
  function header(actions?: ReactNode, intro?: ReactNode) {
    return (
      <div className="find-header">
        <div>
          <h1 className="find-title">
            {answered && !noInterests ? 'Suggested activities' : 'Find activities'} for {name}
            <span lang="mi">{answered && !noInterests ? 'Ngā ngohe' : 'Rapu ngohe'}</span>
          </h1>
          {intro && <p className="find-intro">{intro}</p>}
        </div>
        {actions && <div className="find-header-actions">{actions}</div>}
      </div>
    )
  }

  // Nothing to match on: say what to do instead of asking the AI
  if (noInterests) {
    return (
      <>
        {header()}
        <div className="find-panel">
          <h2>Add interests or goals first</h2>
          <p>
            Nīkau matches on {name}'s goals and interests. Add at least one to {name}'s profile
            to get suggestions.
          </p>
          <div className="profile-actions">
            <Link to={editLink} className="button button-primary">
              Edit profile
            </Link>
            <Link to={catalogueLink} className="button button-outline">
              Search the catalogue for {name}
            </Link>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {view.kind === 'suggestions' &&
        header(
          <>
            <Link to={catalogueLink} className="button button-outline">
              Browse catalogue
            </Link>
            {findAgain}
          </>,
          <>Leads to follow up. Save the ones worth a call. You don't need to judge every one.</>,
        )}
      {view.kind === 'no_fit' && header(findAgain)}
      {(view.kind === 'finding' || view.kind === 'unavailable') && header()}

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
          <div className="find-warning-text">
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
          </div>
          <div className="find-warning-actions">
            <button type="button" className="button-primary" onClick={find}>
              <RefreshCw size={18} aria-hidden="true" />
              Try suggestions again
            </button>
            <Link to={catalogueLink} className="button button-outline">
              Search the catalogue for {name}
            </Link>
          </div>
        </div>
      )}

      {/* 07: matching worked, but nothing fits well enough. A real answer, not an error */}
      {view.kind === 'no_fit' && (
        <>
          <div className="find-panel find-empty">
            <span className="find-empty-mark">
              <img src="/favicon.svg" alt="" width={32} height={32} />
            </span>
            <h2>No good fit for {name} this time</h2>
            <p>
              {view.nothingReachable
                ? `No activities in the catalogue match ${name}'s access needs, cost and times yet.`
                : `Nīkau checked the activities ${name} can reach and afford, but none fit ${name}'s goals or interests well enough to suggest.`}{' '}
              That's a real answer, not an error.
            </p>
          </div>

          <h2 className="find-next-heading">What you can do next</h2>
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
              <p>Profile updated {updated}. New goals or interests can change what fits.</p>
              <Link to={editLink} className="button button-outline">
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

          <p className="find-footnote">
            Suggestions come from Nīkau's checked activity catalogue. {name}'s name, contact
            details and address are never shared with the matching service.
          </p>
        </>
      )}

      {/* 05: the suggestions, each with the AI's reasons */}
      {view.kind === 'suggestions' && (
        <>
          {/* What the suggestions are based on, and what the AI was (and wasn't) told */}
          <section className="find-context" aria-label="What these suggestions are based on">
            <p>
              <strong>Matched on:</strong> {matchedOn}
              <span className="find-context-muted">
                Profile updated {updated} · <Link to={editLink}>Edit profile</Link>
              </span>
            </p>
            <p className="find-privacy">
              <Lock size={16} aria-hidden="true" />
              <span>
                <strong>Shared with the matching service:</strong> goals, interests, access and
                support needs, suburb, age range and free times. <strong>Not shared:</strong>{' '}
                {name}'s name, birth year, contact details or address.
              </span>
            </p>
          </section>

          {saveMessage && (
            <p className="find-saved-message">
              <Check size={18} aria-hidden="true" /> {saveMessage}
            </p>
          )}

          <ol className="find-leads">
            {view.match.leads.map((lead, i) => {
              const meta = activityMeta(lead)
              const chips = leadChips(lead)
              const reasons = (
                <div className="find-why">
                  <p className="find-why-label">Why it was suggested · AI-written</p>
                  {/* Only the parts the AI filled in, so there's no empty column */}
                  <div className="find-why-columns">
                    {(
                      [
                        ['Why it fits', lead.why_fits],
                        ["What it doesn't cover", lead.why_doesnt_cover],
                        ['Ask the provider', lead.why_ask],
                      ] as const
                    )
                      .filter(([, items]) => items.length > 0)
                      .map(([title, items]) => (
                        <div key={title}>
                          <Why title={title} items={items} />
                        </div>
                      ))}
                  </div>
                </div>
              )
              return (
                <li key={lead.activity_id} className="find-lead">
                  <div className="find-lead-head">
                    <span className="find-rank" aria-hidden="true">
                      {i + 1}
                    </span>
                    <div className="find-lead-title">
                      <h2>
                        <Link to={`/activities/${lead.activity_id}`}>{lead.activity_name}</Link>
                      </h2>
                      {meta && <p className="find-lead-meta">{meta}</p>}
                    </div>
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

                  {i < OPEN_REASONS ? (
                    <>
                      {chips.length > 0 && (
                        <ul className="find-chips" aria-label="About this activity">
                          {chips.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      )}
                      {reasons}
                    </>
                  ) : (
                    // Lower-ranked: reasons on request, so the top three stand out
                    <details className="find-more">
                      <summary>
                        Show why<span className="visually-hidden"> for {lead.activity_name}</span>
                      </summary>
                      {chips.length > 0 && (
                        <ul className="find-chips" aria-label="About this activity">
                          {chips.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      )}
                      {reasons}
                    </details>
                  )}
                </li>
              )
            })}
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
