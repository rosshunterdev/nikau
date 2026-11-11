import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import type { ClientDetail } from '../lib/types'
import FindActivities from '../components/FindActivities'
import './ClientForm.css'

// SCRUM-117 / SCRUM-91: Find activities on its own page. Matching starts as soon as
// the client has loaded; the component shows loading, suggestions (05),
// matching unavailable (06) and no good fit (07).
export default function FindActivitiesPage() {
  const { id } = useParams()
  const [client, setClient] = useState<ClientDetail>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    api<ClientDetail>(`/clients/${id}`)
      .then(setClient)
      .catch((err) =>
        setError(
          err instanceof ApiError && err.status === 404
            ? 'Client not found.'
            : "Can't load this client. Try again.",
        ),
      )
  }, [id])

  if (!client) {
    return error ? (
      <p role="alert">
        {error} <Link to="/clients">Back to clients</Link>
      </p>
    ) : (
      <p>Loading client…</p>
    )
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <ol>
          <li>
            <Link to="/clients">Clients</Link>
          </li>
          <li>
            <Link to={`/clients/${client.client_id}`}>{client.preferred_name}</Link>
          </li>
          <li aria-current="page">Find activities</li>
        </ol>
      </nav>

      <h1 className="find-title">
        Find activities for {client.preferred_name}
        <span lang="mi">Rapu ngohe</span>
      </h1>

      {/* key: a different client gets a fresh search */}
      <FindActivities key={client.client_id} client={client} />
    </>
  )
}
