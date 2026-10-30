import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { normMatch, phaseCmp } from '../lib/format'
import MatchCard from '../components/MatchCard'
import MatchRow from '../components/MatchRow'
import ResultRow, { outcome } from '../components/ResultRow'
import GoTo from '../components/GoTo'
import TeamBadge from '../components/TeamBadge'

const isPast = (s) => s === 'FINISHED' || s === 'CANCELLED'
const ORDER = { LIVE: 0, READY: 1, SCHEDULED: 2 }
const MAX_DONE = 8

const Chip = ({ on, onClick, children }) => (
  <button onClick={onClick} className={'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold ' + (on ? 'border-accent bg-accent text-black' : 'border-line bg-surface')}>
    {children}
  </button>
)

// Partidos de los equipos que represento: en vivo arriba, próximos agrupados por torneo y resultados con mi marcador
export default function MisPartidosPage() {
  const [teams, setTeams] = useState([])
  const [matches, setMatches] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('proximos')
  const [team, setTeam] = useState('all')
  const [moreDone, setMoreDone] = useState(false)

  useEffect(() => {
    let alive = true
    api('GET', '/me/profile')
      .then(async (d) => {
        const ts = d.profile?.teams ?? []
        const lists = await Promise.all(ts.map((t) => api('GET', '/matches?teamId=' + t.teamId + '&limit=200').catch(() => [])))
        if (!alive) return
        const byId = new Map()
        lists.flat().forEach((m) => byId.set(m.id ?? m.matchId, normMatch(m)))
        setTeams(ts)
        setMatches([...byId.values()])
      })
      .catch((e) => { if (alive) setErr(e.message) })
    return () => { alive = false }
  }, [])

  // Equipos distintos (un mismo equipo puede estar en dos ramas)
  const distinct = useMemo(() => [...new Map(teams.map((t) => [t.teamId, t])).values()], [teams])
  const myIds = useMemo(() => (team === 'all' ? distinct.map((t) => t.teamId) : [team]), [team, distinct])

  const mine = useMemo(
    () => (matches ?? []).filter((m) => team === 'all' || m.teamA?.id === team || m.teamB?.id === team),
    [matches, team]
  )
  const upcoming = useMemo(
    () => mine.filter((m) => !isPast(m.status)).sort((a, b) => ORDER[a.status] - ORDER[b.status] || String(a.scheduledAt ?? '9').localeCompare(String(b.scheduledAt ?? '9')) || phaseCmp(a, b)),
    [mine]
  )
  const past = useMemo(
    () => mine.filter((m) => m.status === 'FINISHED').sort((a, b) => String(b.finishedAt ?? b.scheduledAt ?? '').localeCompare(String(a.finishedAt ?? a.scheduledAt ?? ''))),
    [mine]
  )
  const live = upcoming.filter((m) => m.status === 'LIVE')
  const groups = useMemo(() => {
    const out = []
    upcoming.filter((m) => m.status !== 'LIVE').forEach((m) => {
      const gid = m.tournament?.id ?? 'none'
      let g = out.find((x) => x.id === gid)
      if (!g) out.push((g = { id: gid, name: m.tournament?.name ?? 'Amistosos', list: [] }))
      g.list.push(m)
    })
    return out
  }, [upcoming])
  const rec = useMemo(() => {
    const r = { G: 0, E: 0, P: 0 }
    past.forEach((m) => { r[outcome(m, myIds).res] += 1 })
    return r
  }, [past, myIds])

  if (err) return <p className="mt-10 text-center text-danger">{err}</p>
  if (matches === null) return <p className="mt-10 text-center text-muted">Cargando…</p>
  if (matches.length === 0) return <p className="mt-10 text-center text-muted">Todavía no tenés partidos.</p>

  return (
    <div className="space-y-5">
      {/* Resumen */}
      <section className="rounded-3xl border border-line bg-surface p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Mis partidos</p>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {[['Próx.', upcoming.length, ''], ['G', rec.G, 'text-live'], ['E', rec.E, ''], ['P', rec.P, 'text-danger']].map(([k, v, c]) => (
            <div key={k} className="rounded-2xl bg-surface-2 py-2">
              <p className={'font-mono text-xl font-extrabold tabular-nums ' + c}>{v}</p>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted">{k}</p>
            </div>
          ))}
        </div>
      </section>

      {distinct.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Chip on={team === 'all'} onClick={() => setTeam('all')}>Todos mis equipos</Chip>
          {distinct.map((t) => <Chip key={t.teamId} on={team === t.teamId} onClick={() => setTeam(t.teamId)}><TeamBadge team={t} size="sm" />{t.name}</Chip>)}
        </div>
      )}

      <div className="flex border-b border-line" role="tablist">
        {[['proximos', 'Próximos · ' + upcoming.length], ['jugados', 'Jugados · ' + past.length]].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={'flex-1 border-b-2 py-3 text-sm font-bold ' + (tab === k ? 'border-accent' : 'border-transparent text-muted')}>{label}</button>
        ))}
      </div>

      {tab === 'proximos' && (
        <section className="space-y-3">
          {upcoming.length === 0 && <p className="rounded-3xl border border-line bg-surface p-6 text-center text-sm text-muted">Sin partidos próximos.</p>}
          {live.map((m) => <MatchCard key={m.id} m={m} featured />)}
          {groups.map((g) => (
            <div key={g.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                {g.id !== 'none'
                  ? <GoTo to={'/liga/' + g.id} className="min-w-0 truncate text-sm font-extrabold text-accent">{g.name} ›</GoTo>
                  : <span className="min-w-0 truncate text-sm font-extrabold">{g.name}</span>}
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted">{g.list.length} {g.list.length === 1 ? 'partido' : 'partidos'}</span>
              </div>
              <div className="divide-y divide-line">{g.list.map((m) => <MatchRow key={m.id} m={m} flat />)}</div>
            </div>
          ))}
        </section>
      )}

      {tab === 'jugados' && (
        <section className="space-y-2">
          {past.length === 0 && <p className="rounded-3xl border border-line bg-surface p-6 text-center text-sm text-muted">Todavía no jugaste ninguno.</p>}
          {(moreDone ? past : past.slice(0, MAX_DONE)).map((m) => <ResultRow key={m.id} m={m} teamIds={myIds} />)}
          {past.length > MAX_DONE && (
            <button onClick={() => setMoreDone((v) => !v)} className="w-full rounded-2xl border border-line bg-surface py-2 text-sm font-bold">
              {moreDone ? 'Ver menos' : 'Ver todos (' + past.length + ')'}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
