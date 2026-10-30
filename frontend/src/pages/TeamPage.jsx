import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MapPin, CalendarDays, Trophy, Flag } from 'lucide-react'
import FavHeart from '../components/FavHeart'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { BRANCH, MODALITY, normMatch } from '../lib/format'
import TeamBadge from '../components/TeamBadge'
import Roster from '../components/Roster'
import MatchCard from '../components/MatchCard'
import MatchRow from '../components/MatchRow'
import GoTo from '../components/GoTo'
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

const NEXT_MAX = 5 // próximos compactos visibles antes de "Ver todos"

// Banner del equipo: datos, récord, próximos partidos, resultados y plantel
export default function TeamPage() {
  const { id } = useParams()
  const user = useAuthStore((s) => s.user)
  const [team, setTeam] = useState(null)
  const [matches, setMatches] = useState(null)
  const [err, setErr] = useState('')
  const [mod, setMod] = useState('all')
  const [br, setBr] = useState('all')
  const [more, setMore] = useState({ next: false, done: false })
  const [tab, setTab] = useState('resumen') // resumen | partidos | posiciones | estadisticas | plantel | historial
  const [ptab, setPtab] = useState('proximos') // dentro de Partidos
  const [st, setSt] = useState(null) // /stats/teams/:id (récord, sets, títulos, historial)

  useEffect(() => {
    api('GET', '/teams/' + id).then(setTeam).catch((e) => setErr(e.message))
    api('GET', '/matches?teamId=' + id + '&limit=200').then((r) => setMatches(r.map(normMatch))).catch(() => setMatches([]))
  }, [id, user])

  useEffect(() => {
    setSt(null)
    const q = [mod !== 'all' ? 'modality=' + mod : '', br !== 'all' ? 'branch=' + br : ''].filter(Boolean).join('&')
    api('GET', '/stats/teams/' + id + (q ? '?' + q : '')).then(setSt).catch(() => setSt(false))
  }, [id, mod, br])

  const shown = useMemo(
    () => (matches ?? []).filter((m) => (mod === 'all' || m.modality === mod) && (br === 'all' || m.branch === br)),
    [matches, mod, br]
  )
  const next = useMemo(() => shown.filter((m) => ACTIVE.includes(m.status)).sort(byDate(1)), [shown])
  // Próximos: los en vivo siempre arriba y grandes; el resto compacto (hasta NEXT_MAX) y agrupado por torneo
  const live = useMemo(() => next.filter((m) => m.status === 'LIVE'), [next])
  const upcoming = useMemo(() => next.filter((m) => m.status !== 'LIVE'), [next])
  const groups = useMemo(() => {
    const out = []
    ;(more.next ? upcoming : upcoming.slice(0, NEXT_MAX)).forEach((m) => {
      const gid = m.tournament?.id ?? 'none'
      let g = out.find((x) => x.id === gid)
      if (!g) out.push((g = { id: gid, name: m.tournament?.name ?? 'Amistosos', list: [] }))
      g.list.push(m)
    })
    return out
  }, [upcoming, more.next])
  // Resultados de adelante para atrás: dentro de cada torneo primero la instancia más avanzada (final, tercer puesto, semis… Fecha 3, 2, 1)
  const done = useMemo(() => {
    const fin = shown.filter((m) => m.status === 'FINISHED').sort(byDate(-1))
    const key = (m) => m.tournament?.id ?? 'none'
    const latest = new Map()
    fin.forEach((m) => { if (!latest.has(key(m))) latest.set(key(m), m.scheduledAt ? new Date(m.scheduledAt).getTime() : 0) }) // fin ya viene de la más reciente
    return [...fin].sort((a, b) =>
      (latest.get(key(b)) - latest.get(key(a))) || key(a).localeCompare(key(b)) ||
      (b.phase?.order ?? -1) - (a.phase?.order ?? -1) || byDate(-1)(a, b))
  }, [shown])
  const rec = useMemo(() => {
    const r = { G: 0, E: 0, P: 0 }
    for (const m of done) r[outcome(m, [id]).res] += 1
    return r
  }, [done, id])

  if (err && !team) return <p className="mt-10 text-center text-danger">{err}</p>
  if (!team) return <p className="mt-10 text-center text-muted">Cargando…</p>

  const heart = (type, tid) => <FavHeart type={type} id={tid} compact={type === 'PLAYER'} name={type === 'TEAM' ? team.name : ''} />

  const mods = team.modalities ?? []
  const brs = team.branches ?? []
  // Qué categoría muestran los números y las listas
  const scope = mod === 'all' && br === 'all' ? 'Total: todas las ramas y modalidades' : [br === 'all' ? 'Todas las ramas' : BRANCH[br], mod === 'all' ? 'Todas las modalidades' : MODALITY[mod]].join(' · ')
  const players = (team.roster ?? []).filter((r) => br === 'all' || r.branch === br)

  const matchList = (
    <section className="space-y-3">
      <div className="flex gap-2">
        {[['proximos', 'Próximos' + (matches ? ' · ' + next.length : '')], ['resultados', 'Resultados' + (matches ? ' · ' + done.length : '')]].map(([k, label]) => (
          <button key={k} onClick={() => setPtab(k)} className={'rounded-full border px-4 py-2 text-sm font-bold ' + (ptab === k ? 'border-accent bg-accent text-black' : 'border-line bg-surface')}>{label}</button>
        ))}
      </div>
      {ptab === 'proximos' && (
        <>
          {matches === null && <p className="text-muted">Cargando…</p>}
          {matches && next.length === 0 && <p className="text-muted">No hay partidos programados.</p>}
          {live.map((m) => <MatchCard key={m.id} m={m} />)}
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
          {upcoming.length > NEXT_MAX && (
            <button onClick={() => setMore((x) => ({ ...x, next: !x.next }))} className="w-full rounded-2xl border border-line bg-surface py-2 text-sm font-bold">
              {more.next ? 'Ver menos' : 'Ver todos (' + upcoming.length + ')'}
            </button>
          )}
        </>
      )}
      {ptab === 'resultados' && (
        <>
          {matches && done.length === 0 && <p className="text-muted">Todavía no jugó partidos.</p>}
          {(more.done ? done : done.slice(0, 5)).map((m) => <ResultRow key={m.id} m={m} teamIds={[id]} />)}
          {done.length > 5 && (
            <button onClick={() => setMore((x) => ({ ...x, done: !x.done }))} className="w-full rounded-2xl border border-line bg-surface py-2 text-sm font-bold">
              {more.done ? 'Ver menos' : 'Ver todos (' + done.length + ')'}
            </button>
          )}
        </>
      )}
    </section>
  )

  return (
    <div className="-mt-1 space-y-5">
      {err && <p className="text-sm text-danger">{err}</p>}

      {/* Banner: nombre arriba, franja con ramas y modalidades, escudo encimado */}
      <section className="overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="relative px-5 pb-16 pt-5">
          <div className="absolute right-3 top-3">{heart('TEAM', team.id)}</div>
          <p className="pr-10 text-lg font-light leading-tight">{team.nickname ? '"' + team.nickname + '"' : ' '}</p>
          <h1 className="pr-10 text-3xl font-extrabold leading-tight">{team.name}</h1>
          {(team.city || team.foundedYear) && (
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {team.city && <span className="inline-flex items-center gap-1"><MapPin size={12} />{team.city}</span>}
              {team.foundedYear && <span className="inline-flex items-center gap-1"><CalendarDays size={12} />Fundado en {team.foundedYear}</span>}
            </p>
          )}
        </div>
        <div className="relative flex min-h-16 flex-wrap items-center gap-1.5 bg-accent-soft py-3 pl-5 pr-28">
          {brs.map((b) => <span key={b} className="rounded-full bg-bg/60 px-2.5 py-1 text-[11px] font-bold uppercase">{BRANCH[b] ?? b}</span>)}
          {mods.map((m) => <span key={m} className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold uppercase text-black">{MODALITY[m] ?? m}</span>)}
          <div className="absolute -top-12 right-4"><TeamBadge team={team} size="xl" /></div>
        </div>
        <div className="flex overflow-x-auto border-t border-line" role="tablist">
          {[['resumen', 'Resumen'], ['partidos', 'Partidos'], ['posiciones', 'Posiciones'], ['estadisticas', 'Estadísticas'], ['plantel', 'Plantel'], ['historial', 'Historial']].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={'shrink-0 border-b-2 px-4 py-3 text-sm font-bold ' + (tab === k ? 'border-accent' : 'border-transparent text-muted')}>
              {label}
            </button>
          ))}
        </div>
      </section>

      {(mods.length > 1 || brs.length > 1) && tab !== 'plantel' && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Ver historial de</p>
          {mods.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <Chip on={mod === 'all'} onClick={() => setMod('all')}>Todas las modalidades</Chip>
              {mods.map((m) => <Chip key={m} on={mod === m} onClick={() => setMod(m)}>{MODALITY[m] ?? m}</Chip>)}
            </div>
          )}
          {brs.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <Chip on={br === 'all'} onClick={() => setBr('all')}>Todas las ramas</Chip>
              {brs.map((b) => <Chip key={b} on={br === b} onClick={() => setBr(b)}>{BRANCH[b] ?? b}</Chip>)}
            </div>
          )}
        </div>
      )}

      {tab === 'resumen' && (
        <>
          <section className="space-y-2 rounded-3xl border border-line bg-surface p-4">
            <p className="text-center text-xs font-bold uppercase tracking-widest text-accent">{scope}</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[['PJ', done.length], ['G', rec.G], ['E', rec.E], ['P', rec.P]].map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-surface-2 py-2">
                  <p className="font-mono text-xl font-extrabold tabular-nums">{v}</p>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted">{k}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Próximo partido</h2>
            {matches === null && <p className="text-muted">Cargando…</p>}
            {matches && next.length === 0 && <p className="text-muted">No hay partidos programados.</p>}
            {live.map((m) => <MatchCard key={m.id} m={m} />)}
            {upcoming.slice(0, 2).map((m) => <MatchRow key={m.id} m={m} />)}
            {next.length > 0 && <button onClick={() => { setTab('partidos'); setPtab('proximos') }} className="w-full rounded-2xl border border-line bg-surface py-2 text-sm font-bold">Ver todos los partidos</button>}
          </section>

          {players.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Jugadores</h2>
              <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
                {players.slice(0, 14).map((r) => {
                  const parts = String(r.nickname || r.name).trim().split(/\s+/)
                  const top = r.nickname || parts.length < 2 ? ' ' : parts.slice(0, -1).join(' ')
                  const bottom = r.nickname || parts.length < 2 ? (r.nickname || r.name) : parts[parts.length - 1]
                  return (
                    <Link key={r.profileId + r.branch} to={'/jugador/' + r.profileId} className="w-36 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface">
                      <div className="h-16 px-3 pt-3">
                        <p className="truncate text-sm leading-tight text-muted">{top}</p>
                        <p className="truncate text-base font-extrabold leading-tight">{bottom}</p>
                      </div>
                      <div className="relative flex h-12 items-center bg-accent-soft px-3">
                        <TeamBadge team={team} size="sm" />
                        <span className="ml-auto font-mono text-xs font-bold text-muted">{r.number != null ? '#' + r.number : ''}</span>
                        <span className="absolute -top-5 right-3 grid h-12 w-12 place-items-center rounded-full border-2 border-bg bg-surface-2 text-base font-extrabold text-muted">{(r.nickname || r.name).charAt(0).toUpperCase()}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
              <button onClick={() => setTab('plantel')} className="w-full rounded-2xl border border-line bg-surface py-2 text-sm font-bold">Ver plantel completo</button>
            </section>
          )}

          {done.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Últimos resultados</h2>
              {done.slice(0, 3).map((m) => <ResultRow key={m.id} m={m} teamIds={[id]} />)}
              {done.length > 3 && <button onClick={() => { setTab('partidos'); setPtab('resultados') }} className="w-full rounded-2xl border border-line bg-surface py-2 text-sm font-bold">Ver todos los resultados</button>}
            </section>
          )}
        </>
      )}

      {tab === 'partidos' && matchList}

      {tab === 'posiciones' && <Posiciones teamId={id} mod={mod} br={br} />}

      {tab === 'estadisticas' && (
        <section className="space-y-3 rounded-3xl border border-line bg-surface p-4">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-accent">{scope}</p>
          {st === null && <p className="text-center text-sm text-muted">Cargando…</p>}
          {st === false && <p className="text-center text-sm text-muted">No se pudieron cargar las estadísticas.</p>}
          {st && (
            <>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[['Partidos', st.record.played, ''], ['Ganados', st.record.won, 'text-live'], ['Perdidos', st.record.lost, 'text-danger'], ['Títulos', st.titles, 'text-accent']].map(([l, v, c]) => (
                  <div key={l} className="flex flex-col items-center gap-2">
                    <span className={'grid h-16 w-16 place-items-center rounded-full border-2 border-line bg-surface-2 font-mono text-xl font-extrabold tabular-nums ' + c}>{v}</span>
                    <span className="text-xs font-semibold text-muted">{l}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[['Empatados', st.record.drawn], ['Sets a favor', st.record.setsFor], ['Sets en contra', st.record.setsAgainst]].map(([l, v]) => (
                  <div key={l} className="rounded-2xl bg-surface-2 py-2">
                    <p className="font-mono text-lg font-extrabold tabular-nums">{v}</p>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{l}</p>
                  </div>
                ))}
              </div>
              <p className="text-center text-xs text-muted">Torneos disputados: {st.tournamentsPlayed}</p>
            </>
          )}
        </section>
      )}

      {tab === 'plantel' && (
        <section className="space-y-2">
          <Roster roster={team.roster} meProfileId={user?.profileId} extra={(r) => heart('PLAYER', r.profileId)} />
        </section>
      )}

      {tab === 'historial' && (
        <section className="space-y-3">
          {st === null && <p className="text-muted">Cargando…</p>}
          {st && st.titlesList?.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Títulos · {st.titles}</h2>
              {st.titlesList.map((t) => (
                <GoTo key={t.id} to={'/liga/' + t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><Trophy size={18} /></span>
                  <span className="min-w-0 flex-1 truncate font-bold">{t.name}</span>
                  <span className="font-mono text-sm font-bold text-muted">{t.year}</span>
                </GoTo>
              ))}
            </div>
          )}
          {st && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Torneos · {(st.career ?? []).length}</h2>
              {(st.career ?? []).length === 0 && <p className="text-muted">Todavía no disputó torneos.</p>}
              {(st.career ?? []).map((h) => {
                const k = h.result?.kind
                const ord = { RUNNER_UP: '2.º', THIRD: '3.º', FOURTH: '4.º' }[k]
                const tone = k === 'CHAMPION' ? 'text-accent' : k === 'IN_PLAY' ? 'text-live' : ''
                return (
                  <GoTo key={h.tournamentId} to={'/liga/' + h.tournamentId} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                    <span className={'grid h-10 w-10 shrink-0 place-items-center rounded-full font-mono text-sm font-extrabold ' + (k === 'CHAMPION' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted')}>
                      {k === 'CHAMPION' ? <Trophy size={18} /> : ord ?? <Flag size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{h.tournament}{h.edition ? ' · ' + h.edition : ''}</p>
                      {h.result && <p className={'truncate text-sm font-bold ' + tone}>{h.result.label}</p>}
                      {h.zone && <p className="truncate text-xs text-muted">{h.zone.position}.º en {h.zone.name} · {h.zone.points} pts · {h.zone.played} PJ · {h.year}</p>}
                    </div>
                    {h.status === 'ACTIVE' && <span className="shrink-0 rounded-full bg-live/15 px-2 py-0.5 text-[11px] font-bold uppercase text-live">En curso</span>}
                  </GoTo>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
