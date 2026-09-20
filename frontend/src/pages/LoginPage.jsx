import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export default function LoginPage() {
  const { user, loading, signIn, signUp } = useAuthStore()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  useEffect(() => {
    if (user) navigate(from, { replace: true })
  }, [user, from, navigate])

  if (!loading && user) return <Navigate to={from} replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(email.trim(), password)
      } else {
        await signUp(email.trim(), password)
        setInfo('Te enviamos un mail de confirmación. Confirmalo y después ingresá.')
        setMode('login')
      }
    } catch (err) {
      setError(err.message || 'Error')
    } finally {
      setBusy(false)
    }
  }

  const field =
    'w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-accent'

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">Championship Chrono</p>
      <h1 className="mb-8 mt-1 text-3xl font-extrabold">Cronómetro Dodgeball</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input className={field} type="email" placeholder="Mail" required
          value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <input className={field} type="password" placeholder="Contraseña" required minLength={6}
          value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />

        {error && <p className="text-sm text-danger">{error}</p>}
        {info && <p className="text-sm text-live">{info}</p>}

        <button disabled={busy}
          className="mt-2 rounded-xl bg-accent px-4 py-3 font-bold text-black disabled:opacity-50">
          {busy ? '...' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
        </button>
      </form>

      <button type="button" className="mt-4 text-sm text-muted"
        onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setInfo('') }}>
        {mode === 'login' ? '¿No tenés cuenta? Registrate' : '¿Ya tenés cuenta? Ingresá'}
      </button>
    </main>
  )
}
