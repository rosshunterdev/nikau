import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import SignIn from './pages/SignIn'

type Profile = {
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
    if (!session) {
      setProfile(null)
      return
    }
    supabase
      .from('profiles')
      .select('first_name, role, is_active')
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

  if (checking) return <p>Loading…</p>
  if (!session) return <SignIn notice={notice} />
  if (!profile) return <p>Loading…</p>

  // Placeholder home screen until the real screens are built
  return (
    <main style={{ padding: 24 }}>
      <h1>Kia ora, {profile.first_name}</h1>
      <p>Signed in as {profile.role === 'coordinator' ? 'Coordinator' : 'Support worker'}</p>
      <button onClick={() => supabase.auth.signOut()}>Sign out</button>
    </main>
  )
}