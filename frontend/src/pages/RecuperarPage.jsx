import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Destino del enlace de "Olvidaste tu contraseña": el enlace deja una sesión temporal para elegir la contraseña nueva
export default function RecuperarPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(null) // null = verificando
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((ev, s) => { if (ev === 'PASSWORD_RECOVERY' || s) setReady(true) })
    supabase.auth.getSession().then(({ data: d }) => setReady((r) => r ?? !!d.session))
    const t = setTimeout(() => setReady((r) => r ?? false), 4000)
    return () => { data.subscription.unsubscribe(); clearTimeout(t) }
  }, [])

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (pass.length < 6) return setError('La contraseña necesita al menos 6 caracteres')
    if (pass !== pass2) return setError('Las contraseñas no coinciden')
    setBusy(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pass })
      if (err) throw err
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Error')
    } finally {
      setBusy(false)
    }
  }

  const field = 'w-full rounded-xl border border-line bg-surface px-4 py-3.5 text-base outline-none focus:border-accent'

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">Dodgeball</p>
      <h1 className="mb-6 mt-1 text-3xl font-extrabold">Contraseña nueva</h1>
      {ready === null && <p className="text-muted">Verificando enlace…</p>}
      {ready === false && (
        <div className="space-y-4">
          <p className="text-sm text-danger">El enlace venció o ya se usó. Pedí uno nuevo desde "¿Olvidaste tu contraseña?".</p>
          <Link to="/login" className="block rounded-xl bg-accent py-3.5 text-center font-extrabold text-black">Ir a iniciar sesión</Link>
        </div>
      )}
      {ready && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input className={field} type="password" placeholder="Contraseña nueva (mínimo 6)" autoComplete="new-password" required value={pass} onChange={(e) => setPass(e.target.value)} />
          <input className={field} type="password" placeholder="Repetir contraseña" autoComplete="new-password" required value={pass2} onChange={(e) => setPass2(e.target.value)} />
          {error && <p className="text-sm text-danger">{error}</p>}
          <button disabled={busy} className="mt-2 rounded-xl bg-accent px-4 py-3.5 font-extrabold text-black disabled:opacity-50">{busy ? '...' : 'Guardar contraseña'}</button>
        </form>
      )}
    </main>
  )
}
