import { useState, type FormEvent } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import './SignIn.css'

type Props = { notice?: string }

export default function SignIn({ notice }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault() // stop the browser reloading the page
    setError(null)

    if (!email.trim()) return setError('Enter your work email.')
    if (!password) return setError('Enter your password.')

    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)

    if (error) {
      // 400 = wrong email or password. Don't say which one, so attackers can't find real emails.
      setError(error.status === 400
        ? 'Email or password is incorrect.'
        : "Can't sign in right now. Please try again.")
    }
    // On success there's nothing to do here: App notices the new session and moves on.
  }

  const message = error ?? notice

  return (
    <main className="signin">
      <form className="signin-card" onSubmit={handleSubmit} noValidate>
        <p className="signin-brand">Nīkau</p>
        <h1>Staff sign in</h1>
        <p className="signin-sub">Find community activities that fit your clients</p>

        <label htmlFor="email">Work email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="name@provider.org.nz"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="password">Password</label>
        <div className="signin-password">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="signin-eye"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>

        {message && <p className="signin-error" role="alert">{message}</p>}

        <button type="submit" className="signin-submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="signin-help">For a new account or a password reset, contact your admin.</p>
      </form>
    </main>
  )
}