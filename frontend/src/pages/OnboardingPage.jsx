import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Heart, Search, Trophy } from 'lucide-react'
import { api } from '../lib/api'
import { BRANCH, MODALITY } from '../lib/format'
import { markOnboarding } from '../lib/onboarding'
import { useAuthStore } from '../stores/authStore'
import TeamBadge from '../components/TeamBadge'

const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const STEPS = [
  { type: 'TEAM', title: 'Elegí tus equipos favoritos', hint: 'Los vas a ver primero y te avisamos de sus partidos.' },
  { type: 'TOURNAMENT', title: 'Elegí tus torneos favoritos', hint: 'Seguí las ligas y copas que más te interesan.' },
]

// Pantalla de bienvenida: equipos y torneos favoritos (con buscador, grilla de 3 columnas, Omitir y puntos de progreso)
export default function OnboardingPage() {
  const { user, loading } = useAuthStore()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [teams, setTeams] = useState(null)
  const [tournaments, setTournaments] = useState(null)
  const [picks, setPicks] = useState({ TEAM: new Set(), TOURNAMENT: new Set() })
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api('GET', '/teams').then(setTeams).catch((e) => setErr(e.message))
    api('GET', '/tournaments?limit=200').then(setTournaments).catch((e) => setErr(e.message))
  }, [])

  const cur = STEPS[step]
  const list = useMemo(() => {
    const src = cur.type === 'TEAM' ? teams : tournaments
    const words = plain(q).split(/\s+/).filter(Boolean)
    return (src ?? [])
      .filter((x) => words.every((w) => plain(x.name).includes(w)))
      .map((x) => ({ ...x, sub: cur.type === 'TOURNAMENT' ? [MODALITY[x.modality], BRANCH[x.branch]].filter(Boolean).join(' · ') : null }))
  }, [cur.type, teams, tournaments, q])

  if (loading) return <div className="grid min-h-screen place-items-center text-muted">Cargando…</div>
  if (!user) return <Navigate to="/login" replace />

  const done = () => { markOnboarding(user.id); navigate('/', { replace: true }) }
  const toggle = (id) => setPicks((p) => {
    const n = new Set(p[cur.type])
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return { ...p, [cur.type]: n }
  })

  async function next() {
    if (step < STEPS.length - 1) { setStep(step + 1); setQ(''); return }
    setBusy(true); setErr('')
    try {
      const all = [...picks.TEAM].map((id) => ['TEAM', id]).concat([...picks.TOURNAMENT].map((id) => ['TOURNAMENT', id]))
      await Promise.all(all.map(([targetType, targetId]) => api('POST', '/favorites', { targetType, targetId })))
      done()
    } catch (e) {
      setErr(e.message); setBusy(false)
    }
  }

  const n = picks[cur.type].size

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-28 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        {step > 0 ? (
          <button onClick={() => { setStep(step - 1); setQ('') }} aria-label="Volver" className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface"><ArrowLeft size={20} /></button>
        ) : <span className="h-11 w-11" />}
        <button onClick={done} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold">Omitir</button>
      </div>

      <div className="mt-4 flex items-center gap-4 rounded-3xl border border-line bg-surface p-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent">
          {cur.type === 'TEAM' ? <Heart size={28} className="fill-current" /> : <Trophy size={28} />}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-accent">Paso {step + 1} de {STEPS.length}</p>
          <h1 className="text-xl font-extrabold leading-tight" style={{ textShadow: 'none' }}>{cur.title}</h1>
          <p className="mt-0.5 text-sm text-muted">{cur.hint}</p>
        </div>
      </div>

      <div className="relative mt-4">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={cur.type === 'TEAM' ? 'Buscar equipo' : 'Buscar torneo'} enterKeyHint="search"
          className="w-full rounded-xl border border-line bg-surface py-3 pl-10 pr-3 text-sm outline-none focus:border-accent" />
      </div>

      {err && <p className="mt-3 text-sm text-danger">{err}</p>}
      {(cur.type === 'TEAM' ? teams : tournaments) === null && !err && <p className="mt-6 text-muted">Cargando…</p>}
      {list.length === 0 && (cur.type === 'TEAM' ? teams : tournaments) !== null && <p className="mt-6 text-muted">No hay resultados.</p>}

      <div className="mt-4 grid grid-cols-3 gap-3">
        {list.map((x) => {
          const on = picks[cur.type].has(x.id)
          return (
            <button key={x.id} onClick={() => toggle(x.id)} aria-pressed={on}
              className={'relative flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center ' + (on ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}>
              {on && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-black"><Check size={13} strokeWidth={3} /></span>}
              <TeamBadge team={x} size="lg" />
              <span className="line-clamp-2 text-xs font-bold leading-tight">{x.name}</span>
              {x.sub && <span className="text-[10px] font-semibold uppercase text-muted">{x.sub}</span>}
            </button>
          )
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line menu-glass">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
          <div className="flex items-center gap-2" aria-label={'Paso ' + (step + 1) + ' de ' + STEPS.length}>
            {STEPS.map((_, i) => <span key={i} className={'h-2 rounded-full transition-all ' + (i === step ? 'w-6 bg-accent' : 'w-2 bg-line')} />)}
            <span className="ml-2 text-xs font-semibold text-muted">{n ? n + ' elegido' + (n === 1 ? '' : 's') : ''}</span>
          </div>
          <button onClick={next} disabled={busy} aria-label={step < STEPS.length - 1 ? 'Siguiente' : 'Listo'}
            className="flex h-12 items-center gap-2 rounded-full bg-accent px-5 font-extrabold text-black disabled:opacity-50">
            {step < STEPS.length - 1 ? <ArrowRight size={22} /> : <>{busy ? '...' : 'Listo'}<Check size={20} /></>}
          </button>
        </div>
      </div>
    </main>
  )
}
