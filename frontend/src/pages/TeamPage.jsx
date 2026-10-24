import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Heart, MapPin, CalendarDays } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { BRANCH, MODALITY, normMatch } from '../lib/format'
import TeamBadge from '../components/TeamBadge'
import Roster from '../components/Roster'
import MatchCard from '../components/MatchCard'
import ResultRow, { outcome } from '../components/ResultRow'
import Posiciones from '../components/team/Posiciones'

const ACTIVE = ['LIVE', 'READY', 'SCHEDULED', 'SUSPENDED']
const byDate = (dir) => (a, b) => {
  const x = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Infinity * dir
  const y = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Infinity * dir
  return dir * (x - y) || 0
}

const Chip = ({ on, onClick, children }) => (
  <button
    onClick={onClick}
    className={'rounded-full border px-3 py-1 text-sm font-bold ' + (on ? 'border-accent bg-accent text-black' : 'border-line bg-surface')}
  >
    {children}
  </button>
)

// Banner del equipo: datos, récord, próximos partidos, resultados y plantel
export default function TeamPage() {
  const { id } = useParams()
  const user = useAuthStore((s) => s.user)
  const [team, setTeam] = useState(null)
  const [matches, setMatches] = useState(null)
  const [favs, setFavs] = useState([])
  const [err, setErr] = useState('')
  const [mod, setMod] = useState('all')
  const [br, setBr] = useState('all')
  const [more, setMore] = useState({ next: false, done: false })
  const [tab, setTab] = useState('posiciones') // posiciones | proximos | resultados | plantel

  const loadFavs = () => (user ? api('GET', '/favorites').then(setFavs).catch(() => {}) : null)
  useEffect(() => {
    api('GET', '/teams/' + id).then(setTeam).catch((e) => setErr(e.message))
    api('GET', '/matches?teamId=' + id + '&limit=200').then((r) => setMatches(r.map(normMatch))).catch(() => setMatches([]))
    loadFavs()
  }, [id, user])

  const isFav = (type, tid) => favs.some((f) => f.targetType === type && f.targetId === tid)

  async function toggle(type, tid) {
    try {
      if (isFav(type, tid)) await api('DELETE', '/favorites/' + type + '/' + tid)
      else await api('POST', '/favorites', { targetType: type, targetId: tid })
      await loadFavs()
    } catch (e) { setErr(e.message) }
  }

  const shown = useMemo(
    () => (matches ?? []).filter((m) => (mod === 'all' || m.modality === mod) && (br === 'all' || m.branch === br)),
    [matches, mod, br]
  )
  const next = useMemo(() => shown.filter((m) => ACTIVE.includes(m.status)).sort(byDate(1)), [shown])
  const done = useMemo(() => shown.filter((m) => m.status === 'FINISHED').sort(byDate(-1)), [shown])
  const rec = useMemo(() => {
    const r = { G: 0, E: 0, P: 0 }
    for (const m of done) r[outcome(m, [id]).res] += 1
    return r
  }, [done, id])

  if (err && !team) return <p className="mt-10 text-center text-danger">{err}</p>
  if (!team) return <p className="mt-10 text-center text-muted">Cargando…</p>

  const heart = (type, tid) =>
    user && (
      <button aria-label="Seguir" onClick={() => toggle(type, tid)}>
        <Heart size={20} className={isFav(type, tid) ? 'fill-accent text-accent' : 'text-muted'} />
      </button>
    )

  const mods = team.modalities ?? []
  const brs = team.branches ?? []
  // Qué categoría muestran los números y las listas
  const scope = mod === 'all' && br === 'all' ? 'Total: todas las ramas y modalidades' : [br === 'all' ? 'Todas las ramas' : BRANCH[br], mod === 'all' ? 'Todas las modalidades' : MODALITY[mod]].join(' · ')

  return (
    <div className="space-y-5">
      {err && <p className="text-sm text-danger">{err}</p>}

      <section className="rounded-3xl border border-line bg-surface p-5">
        <div className="flex justify-end">{heart('TEAM', team.id)}</div>
        <div className="-mt-3 flex flex-col items-center gap-2 text-center">
          <TeamBadge team={team} size="xl" />
          <h1 className="text-2xl font-extrabold leading-tight">{team.name}</h1>
          {team.nickname && <p className="text-sm font-semibold text-accent">"{team.nickname}"</p>}
          {(team.city || team.foundedYear) && (
            <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted">
              {team.city && <span className="inline-flex items-center gap-1"><MapPin size={14} />{team.city}</span>}
              {team.foundedYear && <span className="inline-flex items-center gap-1"><CalendarDays size={14} />Fundado en {team.foundedYear}</span>}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-1.5 pt-1">
            {brs.map((b) => <span key={b} className="rounded-full bg-surface-2 px-3 py-1 text-xs font-bold uppercase">{BRANCH[b] ?? b}</span>)}
            {mods.map((m) => <span key={m} className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold uppercase text-accent">{MODALITY[m] ?? m}</span>)}
          </div>
        </div>
        {(mods.length > 1 || brs.length > 1) && (
          <div className="mt-4 space-y-2 border-t border-line pt-4">
            <p className="text-center text-xs font-bold uppercase tracking-widest text-muted">Ver historial de</p>
            {mods.length > 1 && (
              <div className="flex flex-wrap justify-center gap-2">
                <Chip on={mod === 'all'} onClick={() => setMod('all')}>Todas las modalidades</Chip>
                {mods.map((m) => <Chip key={m} on={mod === m} onClick={() => setMod(m)}>{MODALITY[m] ?? m}</Chip>)}
              </div>
            )}
            {brs.length > 1 && (
              <div className="flex flex-wrap justify-center gap-2">
                <Chip on={br === 'all'} onClick={() => setBr('all')}>Todas las ramas</Chip>
                {brs.map((b) => <Chip key={b} on={br === b} onClick={() => setBr(b)}>{BRANCH[b] ?? b}</Chip>)}
              </div>
            )}
          </div>
        )}
        <p className="mt-4 text-center text-xs font-bold uppercase tracking-widest text-accent">{scope}</p>
        <div className="mt-2 grid grid-cols-4 gap-2 text-center">
          {[['PJ', done.length], ['G', rec.G], ['E', rec.E], ['P', rec.P]].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-surface-2 py-2">
              <p className="font-mono text-xl font-extrabold tabular-nums">{v}</p>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted">{k}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {[['posiciones', 'Posiciones'], ['proximos', 'Próximos' + (matches ? ' · ' + next.length : '')], ['resultados', 'Resultados' + (matches ? ' · ' + done.length : '')], ['plantel', 'Plantel']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={'rounded-full border px-4 py-2 text-sm font-bold ' + (tab === k ? 'border-accent bg-accent text-black' : 'border-line bg-surface')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'posiciones' && <Posiciones teamId={id} mod={mod} br={br} />}

      {tab === 'proximos' && (
        <section className="space-y-2">
          {matches === null && <p className="text-muted">Cargando…</p>}
          {matches && next.length === 0 && <p className="text-muted">No hay partidos programados.</p>}
          {(more.next ? next : next.slice(0, 3)).map((m) => <MatchCard key={m.id} m={m} />)}
          {next.length > 3 && (
            <button onClick={() => setMore((s) => ({ ...s, next: !s.next }))} className="w-full rounded-2xl border border-line bg-surface py-2 text-sm font-bold">
              {more.next ? 'Ver menos' : 'Ver todos (' + next.length + ')'}
            </button>
          )}
        </section>
      )}

      {tab === 'resultados' && (
        <section className="space-y-2">
          {matches && done.length === 0 && <p className="text-muted">Todavía no jugó partidos.</p>}
          {(more.done ? done : done.slice(0, 5)).map((m) => <ResultRow key={m.id} m={m} teamIds={[id]} />)}
          {done.length > 5 && (
            <button onClick={() => setMore((s) => ({ ...s, done: !s.done }))} className="w-full rounded-2xl border border-line bg-surface py-2 text-sm font-bold">
              {more.done ? 'Ver menos' : 'Ver todos (' + done.length + ')'}
            </button>
          )}
        </section>
      )}

      {tab === 'plantel' && (
        <section className="space-y-2">
          <Roster roster={team.roster} meProfileId={user?.profileId} extra={(r) => heart('PLAYER', r.profileId)} />
        </section>
      )}
    </div>
  )
}
