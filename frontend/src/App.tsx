import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import SignIn from './pages/SignIn'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router'
import ClientList from './pages/ClientList'
import ClientForm from './pages/ClientForm'

type Profile = {
  user_id: string
  first_name: string
  role: 'support_worker' | 'coordinator'
  is_active: boolean
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [checking, setChecking] = useState(true)
  const [notice, setNotice] = useState<string>()

  // 1. On page load, check for an existing session, then listen for sign-in and sign-out
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecking(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => subscription.unsubscribe() // tidy up when the app closes
  }, [])

  // 2. When there's a session, load the person's profile to get their role
  useEffect(() => {
    if (!session) return // nothing to load; an old profile is ignored below
    supabase
      .from('profiles')
      .select('user_id, first_name, role, is_active')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setNotice("Can't load your account. Please try again.")
          supabase.auth.signOut()
        } else if (!data || !data.is_active) {
          setNotice('Your account is inactive. Contact your admin.')
          supabase.auth.signOut()
        } else {
          setNotice(undefined)
          setProfile(data as Profile)
        }
      })
  }, [session])

  // Only use the profile if it belongs to whoever is signed in right now
  const currentProfile =
    session && profile?.user_id === session.user.id ? profile : null

  if (checking) return <p>Loading…</p>
  if (!session) return <SignIn notice={notice} />
  if (!currentProfile) return <p>Loading…</p>

    // Signed in: a simple header, then whichever page matches the address
  return (
    <BrowserRouter>
      <header style={{ display: 'flex', gap: 16, alignItems: 'center', padding: 16 }}>
        <strong>Nīkau</strong>
        <Link to="/clients">Clients</Link>
        <span style={{ marginLeft: 'auto' }}>
          {currentProfile.first_name} ·{' '}
          {currentProfile.role === 'coordinator' ? 'Coordinator' : 'Support worker'}
        </span>
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <main style={{ padding: 16 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/clients" replace />} />
          <Route path="/clients" element={<ClientList />} />
          <Route path="/clients/new" element={<ClientForm />} />
          <Route path="/clients/:id" element={<ClientForm />} />
          <Route path="*" element={<p>Page not found.</p>} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}