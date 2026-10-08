import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { Btn, Alert, inputCls } from '../components/ui'

const BRANCH_LABEL = { MIXED: 'Mixto', MALE: 'Masculino', FEMALE: 'Femenino' }
const ALLOWED = { M: ['MIXED', 'MALE'], F: ['MIXED', 'FEMALE'] }

// Pasos: mail -> código -> contraseña -> datos de jugador (queda pendiente de aprobación)
export default function RegisterPage() {
  const navigate = useNavigate()
  const guest = useSearchParams()[0].get('tipo') === 'invitado' // familiar o amigo: solo cuenta, sin alta de jugador
  const { session, user, loading } = useAuthStore()
  const [step, setStep] = useState('mail')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const [teams, setTeams] = useState([])
  const [f, setF] = useState({ name: '', dni: '', sex: '', number: '' })
  const [picks, setPicks] = useState({}) // { MIXED: teamId, MALE: teamId, FEMALE: teamId }

  // Con sesión abierta se salta directo al formulario (o se manda al inicio si ya tiene perfil)
  useEffect(() => {
    if (loading || !session || step !== 'mail') return
    if (user?.profileId || user?.roles?.length) return navigate('/', { replace: true })
    if (guest) return navigate('/', { replace: true })
    setEmail(session.user?.email ?? '')
    setStep('form')
  }, [loading, session, user, step, navigate, guest])

  useEffect(() => {
    if (step === 'form') api('GET', '/teams').then(setTeams).catch((e) => setErr(e.message))
  }, [step])

  const run = async (fn) => {
    setErr(''); setBusy(true)
    try { await fn() } catch (e) { setErr(e.data?.errors?.join(' · ') || e.message || 'Error') } finally { setBusy(false) }
  }

  const sendCode = (e) => {
    e.preventDefault()
    run(async () => {
      const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } })
      if (error) throw error
      setStep('code')
    })
  }

  const verify = (e) => {
    e.preventDefault()
    run(async () => {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
      if (error) throw new Error('Código incorrecto o vencido')
      setStep('pass')
    })
  }

  const setPassword = (e) => {
    e.preventDefault()
    if (pass.length < 6) return setErr('La contraseña tiene que tener al menos 6 caracteres')
    if (pass !== pass2) return setErr('Las contraseñas no coinciden')
    run(async () => {
      const { error } = await supabase.auth.updateUser({ password: pass })
      if (error) throw error
      // Cuenta que ya existía y está completa (jugador, árbitro, admin): directo al inicio
      const me = await api('GET', '/me').catch(() => null)
      if (guest || me?.user?.profileId || me?.user?.roles?.length) navigate('/', { replace: true })
      else setStep('form')
    })
  }

  const branches = ALLOWED[f.sex] ?? []
  const teamsFor = (b) => teams.filter((t) => (t.branches ?? []).includes(b))
  const chosen = branches.filter((b) => picks[b]).map((b) => ({ teamId: picks[b], branch: b }))

  const submit = (e) => {
    e.preventDefault()
    if (!chosen.length) return setErr('Elegí al menos un equipo')
    run(async () => {
      await api('POST', '/player-requests', {
        name: f.name.trim(), dni: f.dni, sex: f.sex, number: f.number === '' ? null : Number(f.number), teams: chosen,
      })
      navigate('/', { replace: true })
    })
  }

  const titles = { mail: guest ? 'Creá tu cuenta' : 'Registrate', code: 'Ingresá el código', pass: 'Elegí tu contraseña', form: 'Tus datos de jugador' }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">Dodgeball</p>
      <h1 className="mb-2 mt-1 text-3xl font-extrabold">{titles[step]}</h1>
      {step === 'mail' && <p className="mb-6 text-sm text-muted">{guest ? 'Para seguir partidos y equipos. ' : ''}Te mandamos un código al mail para confirmar que es tuyo.</p>}
      {step === 'code' && <p className="mb-6 text-sm text-muted">Lo enviamos a {email}. Revisá también spam o promociones.</p>}
      {step === 'form' && <p className="mb-6 text-sm text-muted">La organización los revisa contra la planilla de inscripción y te habilita.</p>}

      {err && <div className="mb-3"><Alert onClose={() => setErr('')}>{err}</Alert></div>}

      {step === 'mail' && (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <input className={inputCls} type="email" required placeholder="Mail" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Btn type="submit" tone="accent" disabled={busy}>{busy ? '…' : 'Enviar código'}</Btn>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verify} className="flex flex-col gap-3">
          <input className={inputCls + ' text-center text-2xl tracking-[0.3em]'} inputMode="numeric" autoComplete="one-time-code" required maxLength={8} placeholder="········"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <Btn type="submit" tone="accent" disabled={busy || code.length < 6}>{busy ? '…' : 'Confirmar'}</Btn>
          <button type="button" className="text-sm text-muted" onClick={() => { setStep('mail'); setCode(''); setErr('') }}>Cambiar mail o reenviar</button>
        </form>
      )}

      {step === 'pass' && (
        <form onSubmit={setPassword} className="flex flex-col gap-3">
          <input className={inputCls} type="password" required minLength={6} placeholder="Contraseña" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          <input className={inputCls} type="password" required minLength={6} placeholder="Repetir contraseña" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
          <Btn type="submit" tone="accent" disabled={busy}>{busy ? '…' : 'Continuar'}</Btn>
        </form>
      )}

      {step === 'form' && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input className={inputCls} required maxLength={100} placeholder="Nombre y apellido" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className={inputCls} required inputMode="numeric" placeholder="DNI (solo números)" value={f.dni} onChange={(e) => setF({ ...f, dni: e.target.value.replace(/\D/g, '').slice(0, 12) })} />
          <select className={inputCls} required value={f.sex} onChange={(e) => { setF({ ...f, sex: e.target.value }); setPicks({}) }}>
            <option value="">Sexo</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
          <input className={inputCls} inputMode="numeric" placeholder="Número de camiseta (opcional)" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value.replace(/\D/g, '').slice(0, 3) })} />

          {branches.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted">Tu equipo por rama (al menos uno)</p>
              {branches.map((b) => (
                <label key={b} className="block text-sm font-semibold">
                  {BRANCH_LABEL[b]}
                  <select className={inputCls + ' mt-1'} value={picks[b] ?? ''} onChange={(e) => setPicks({ ...picks, [b]: e.target.value })}>
                    <option value="">— No juego esta rama —</option>
                    {teamsFor(b).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
          <Btn type="submit" tone="accent" disabled={busy || !f.sex}>{busy ? '…' : 'Enviar solicitud'}</Btn>
        </form>
      )}

      <Link to="/login" className="mt-6 text-center text-sm text-muted">¿Ya tenés cuenta? Ingresá</Link>
    </main>
  )
}
