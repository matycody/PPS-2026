import { halfLabel } from '../../lib/pipTime'
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import { dayOf, dayTab } from '../../lib/days'
import { Link } from 'react-router-dom'
import { Pin, PinOff } from 'lucide-react'
import { socket } from '../../sockets/socket'
import { api } from '../../lib/api'
import { normMatch } from '../../lib/format'
import { useMatchesFeed } from '../../hooks/useMatchesFeed'
import { useMatchesStore } from '../../stores/matchesStore'
import { fmtWhen, courtLabel, phaseCmp } from '../../lib/format'
import StatusPill from '../../components/StatusPill'
import MatchRow from '../../components/MatchRow'
import Versus from '../../components/Versus'
import MatchNotice from '../../components/MatchNotice'
import { Btn, Alert, Skeleton } from '../../components/ui'
import { matchInfo } from '../../lib/matchInfo'
import { statusBorder } from '../../lib/statusStyle'
import { usePipClock } from '../../hooks/usePipClock'

const shiftDay = (d, n) => dayOf(new Date(new Date(d + 'T12:00:00').getTime() + n * 864e5).toISOString())
const SHOW_UPCOMING = 8 // próximos que se ven por cancha antes de "Ver más"
const ORDER = { LIVE: 0, READY: 1, SCHEDULED: 2, FINISHED: 3 }
const pad = (t) => (t ? t.replace(/^(\d):/, '0$1:') : '--:--')

// Partido de la cancha con acciones rápidas para la organización
function CourtMatch({ m, tick, full, run, busy }) {
  const [confirm, setConfirm] = useState(false)
  const pip = usePipClock(m)
  const paused = m.status === 'LIVE' && tick?.isMatchPaused
  const open = m.status === 'READY' || m.status === 'LIVE'
  const sets = m.sets ?? []
  const center = m.status === 'LIVE' || sets.length ? (
    <div className="flex flex-col items-center gap-1">
      <span className="font-mono text-4xl font-extrabold tabular-nums">{m.score?.teamA ?? 0} - {m.score?.teamB ?? 0}</span>
      {m.status === 'LIVE' && <span className="font-mono text-lg font-extrabold tabular-nums text-accent">{pad(tick?.matchTime)}</span>}
      {m.status === 'LIVE' && tick?.matchHalf && (
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{halfLabel(tick)}</span>
      )}
    </div>
  ) : undefined

  return (
    <div className={'relative space-y-3 rounded-3xl border bg-surface p-5 ' + statusBorder(m.status)}>
      {pip.canPin && (
        <button
          type="button"
          onClick={pip.toggle}
          aria-label={pip.active ? 'Quitar reloj flotante' : 'Fijar reloj flotante'}
          aria-pressed={pip.active}
          className={'absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full ' + (pip.active ? 'text-live' : 'text-muted')}
        >
          {pip.active ? <PinOff size={18} /> : <Pin size={18} />}
        </button>
      )}
      <div className={'flex items-center justify-between ' + (pip.canPin ? 'pr-8' : '')}>
        <span className="text-xs font-bold uppercase tracking-widest text-muted">{fmtWhen(m.scheduledAt)}</span>
        {paused ? <span className="rounded-full bg-warn/15 px-3 py-1 text-xs font-bold uppercase text-warn">Pausado</span> : <StatusPill status={m.status} />}
      </div>
      {m.status === 'LIVE' && tick?.recovered && (
        <p className="rounded-xl bg-warn/15 px-3 py-2 text-center text-xs font-bold text-warn">Reloj recuperado tras un reinicio del servidor: revisá el tiempo y reanudalo en Control.</p>
      )}
      <Versus a={m.teamA} b={m.teamB} formA={m.form?.A} formB={m.form?.B} rankA={m.form?.rankA} rankB={m.form?.rankB} size={full ? 'lg' : 'md'} center={center} />
      {pip.error && <p className="text-center text-xs text-danger">{pip.error}</p>}
      <p className="text-center text-xs font-bold uppercase tracking-wider text-muted">{matchInfo(m)}</p>
      <MatchNotice m={m} compact className="text-center" />

      <div className="grid grid-cols-2 gap-2">
        {m.status === 'SCHEDULED' && (
          <Btn tone="accent" className="col-span-2" disabled={busy} onClick={() => run(m.id, 'POST', '/ready')}>Habilitar partido</Btn>
        )}
        {m.status === 'READY' && (
          <Btn className="col-span-2" disabled={busy} onClick={() => run(m.id, 'POST', '/unready')}>Deshabilitar partido</Btn>
        )}
      </div>

      {open && sets.length > 0 && (
        <ul className="space-y-1">
          {sets.map((s) => {
            const draw = s.draw === true || s.winnerTeamId == null
            const w = s.winnerTeamId === m.teamA?.id ? m.teamA : m.teamB
            return (
              <li key={s.number} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <span>Set {s.number}: <b>{draw ? 'Empate' : (w?.name ?? '—')}</b></span>
              </li>
            )
          })}
        </ul>
      )}

      {open && !confirm && <Btn tone="danger" className="w-full" disabled={busy} onClick={() => setConfirm(true)}>Finalizar partido</Btn>}
      {open && confirm && (
        <div className="space-y-2 rounded-2xl border box-danger p-3">
          <p className="text-sm font-bold text-danger">¿Finalizar el partido? Cierra el resultado.</p>
          <div className="grid grid-cols-2 gap-2">
            <Btn onClick={() => setConfirm(false)}>Volver</Btn>
            <Btn tone="danger" disabled={busy} onClick={() => run(m.id, 'POST', '/finish').then(() => setConfirm(false))}>Sí, finalizar</Btn>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Link to={'/control/' + m.id} className="rounded-2xl border border-line bg-surface-2 py-3 text-center text-sm font-extrabold">Control</Link>
        <Link to={'/admin/partidos/' + m.id} className="rounded-2xl border border-line bg-surface-2 py-3 text-center text-sm font-extrabold">Administrar</Link>
      </div>
    </div>
  )
}

const LEFT_WARN = 10 * 60 // segundos del 2do tiempo desde los que se prepara el partido que sigue en la cancha
const secs = (t) => { const [m, s] = String(t ?? '').split(':').map(Number); return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : null }
const byTime = (a, b) => String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? '')) || phaseCmp(a, b)

// Una cancha: el partido en vivo en grande y, debajo, todos los que siguen en chiquito (por horario o, sin horario, por el orden del fixture).
// Al 2do tiempo, con menos de 10 minutos, el que sigue muestra sus acciones para que la organización designe árbitros y lo habilite a tiempo.
function CourtSection({ c, ticks, run, busy, title }) {
  const [more, setMore] = useState(false)
  const live = c.list.filter((m) => m.status === 'LIVE')
  const upcoming = c.list.filter((m) => m.status !== 'LIVE').sort(byTime)
  const next = upcoming[0]
  const tick = live[0] ? ticks[live[0].id] : null
  const left = secs(tick?.matchTime)
  // Se prepara el próximo si ya no hay partido en juego en la cancha o si al vivo le quedan menos de 10 minutos del 2do tiempo
  const prepare = !!next && (!live.length || (tick?.matchHalf === 2 && left != null && left < LEFT_WARN))

  return (
    <section className="space-y-3">
      {title && <h2 className="text-xs font-bold uppercase tracking-widest">{courtLabel(c.court)}</h2>}
      {live.map((m) => <CourtMatch key={m.id} m={m} tick={ticks[m.id]} full run={run} busy={busy} />)}

      {upcoming.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-widest">Próximos en {courtLabel(c.court)}</span>
            <span className="text-[11px] font-bold uppercase tracking-wide">{upcoming.length} {upcoming.length === 1 ? 'partido' : 'partidos'}</span>
          </div>
          <div className="divide-y divide-line">
            {(more ? upcoming : upcoming.slice(0, SHOW_UPCOMING)).map((m, i) => (
              <div key={m.id} className={i === 0 && prepare ? 'bg-warn/10' : ''}>
                {i === 0 && prepare && (
                  <p className="px-3 pt-2 text-[11px] font-extrabold uppercase tracking-widest text-warn">
                    {live.length ? 'Sigue · menos de 10 min' : 'Sigue en la cancha'} · designá árbitros y habilitalo
                  </p>
                )}
                <MatchRow
                  m={m}
                  flat
                  to={'/admin/partidos/' + m.id}
                  footer={i === 0 && prepare ? (
                    <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                      {m.status === 'SCHEDULED' && <Btn tone="accent" disabled={busy} onClick={() => run(m.id, 'POST', '/ready')}>Habilitar</Btn>}
                      {m.status === 'READY' && <Btn disabled={busy} onClick={() => run(m.id, 'POST', '/unready')}>Deshabilitar</Btn>}
                      <Link to={'/admin/partidos/' + m.id} className="grid place-items-center rounded-2xl border border-line bg-surface-2 py-3 text-center text-sm font-extrabold">Designar árbitros</Link>
                    </div>
                  ) : (
                    // Los que siguen más adelante también se administran desde acá: horario, mesa, árbitros, etc.
                    <div className="flex justify-end px-3 pb-3">
                      <Link to={'/admin/partidos/' + m.id} className="rounded-full border border-line bg-surface-2 px-4 py-1.5 text-xs font-extrabold">Administrar ›</Link>
                    </div>
                  )}
                />
              </div>
            ))}
          </div>
          {upcoming.length > SHOW_UPCOMING && (
            <button onClick={() => setMore((v) => !v)} className="w-full border-t border-line py-2.5 text-xs font-extrabold uppercase tracking-wide text-accent">
              {more ? 'Ver menos' : 'Ver ' + (upcoming.length - SHOW_UPCOMING) + ' más'}
            </button>
          )}
        </div>
      )}

      {live.length === 0 && upcoming.length === 0 && c.done.length === 0 && <p className="text-muted">Sin partidos en esta cancha.</p>}

      {c.done.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="border-b border-line px-3 py-2 text-xs font-bold uppercase tracking-widest">Finalizados en {courtLabel(c.court)}</div>
          <div className="divide-y divide-line">
            {c.done.map((m) => <MatchRow key={m.id} m={m} flat to={'/admin/partidos/' + m.id} />)}
          </div>
        </div>
      )}
    </section>
  )
}

// Vista "En vivo": solo los partidos en juego. Cuando al 2do tiempo le faltan menos de 10 minutos, el que sigue en esa cancha
// aparece en chiquito, con las acciones para designar árbitros y habilitarlo.
function LiveCourt({ c, ticks, run, busy }) {
  const upcoming = c.list.filter((m) => m.status !== 'LIVE').sort(byTime)
  const next = upcoming[0]
  return c.list.filter((m) => m.status === 'LIVE').map((m) => {
    const tick = ticks[m.id]
    const left = secs(tick?.matchTime)
    const warn = !!next && tick?.matchHalf === 2 && left != null && left < LEFT_WARN
    return (
      <section key={m.id} className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-widest">{courtLabel(c.court)}</h2>
        <CourtMatch m={m} tick={tick} full run={run} busy={busy} />
        {warn && (
          <div className="overflow-hidden rounded-2xl border border-warn/40 bg-warn/10">
            <p className="px-3 pt-2 text-[11px] font-extrabold uppercase tracking-widest text-warn">Sigue en {courtLabel(c.court)} · menos de 10 min</p>
            <MatchRow
              m={next}
              flat
              to={'/admin/partidos/' + next.id}
              footer={
                <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                  {next.status === 'SCHEDULED' && <Btn tone="accent" disabled={busy} onClick={() => run(next.id, 'POST', '/ready')}>Habilitar</Btn>}
                  {next.status === 'READY' && <Btn disabled={busy} onClick={() => run(next.id, 'POST', '/unready')}>Deshabilitar</Btn>}
                  <Link to={'/admin/partidos/' + next.id} className="grid place-items-center rounded-2xl border border-line bg-surface-2 py-3 text-center text-sm font-extrabold">Designar árbitros</Link>
                </div>
              }
            />
          </div>
        )}
      </section>
    )
  })
}

export default function DashboardPage() {
  useMatchesFeed()
  const { byId, loading, error, upsert } = useMatchesStore()
  const [ticks, setTicks] = useState({})
  const [sel, setSel] = useState('live') // 'live' | número de cancha
  const [day, setDay] = useState(() => dayOf(new Date().toISOString())) // jornada que se ve
  const [busy, setBusy] = useState(false)
  const [fin, setFin] = useState({}) // finalizados recientes (el feed general solo trae los activos)
  const [err, setErr] = useState('')

  useEffect(() => {
    const from = encodeURIComponent(new Date(Date.now() - 2 * 864e5).toISOString())
    const load = () => api('GET', '/matches?status=FINISHED&limit=60&from=' + from)
      .then((list) => setFin(Object.fromEntries(list.map((m) => [m.id, normMatch(m)]))))
      .catch(() => {})
    load()
    const onUpd = (p) => { if (p.status === 'FINISHED') load() }
    socket.on('match:updated', onUpd)
    socket.on('connect', load)
    return () => { socket.off('match:updated', onUpd); socket.off('connect', load) }
  }, [])

  // Sedes de la jornada elegida (con cuántos partidos tiene cada una)
  const dayVenues = useMemo(() => {
    const count = {}
    Object.values({ ...fin, ...byId }).forEach((m) => {
      if (m.venue && m.scheduledAt && dayOf(m.scheduledAt) === day && m.status in ORDER) count[m.venue.id] = { name: m.venue.name, n: (count[m.venue.id]?.n ?? 0) + 1 }
    })
    return Object.values(count).sort((a, b) => b.n - a.n)
  }, [fin, byId, day])

  const courts = useMemo(() => {
    const groups = {}
    const all = { ...fin, ...byId }
    Object.values(all)
      // Solo la jornada elegida y con horario cargado (el que está en vivo se ve siempre); la cancha puede faltar
      .filter((m) => m.status in ORDER && (m.status === 'LIVE' || (m.scheduledAt && dayOf(m.scheduledAt) === day)))
      .forEach((m) => { (groups[m.court ?? 0] ??= []).push(m) })
    return Object.entries(groups)
      .map(([court, list]) => {
        const active = list.filter((m) => m.status !== 'FINISHED').sort((a, b) => ORDER[a.status] - ORDER[b.status] || byTime(a, b))
        const done = list.filter((m) => m.status === 'FINISHED').sort((a, b) => byTime(b, a))
        return { court: Number(court), list: active, done }
      })
      .sort((a, b) => (a.court || 999) - (b.court || 999)) // la Cancha 1 arriba de todo, sin cancha al final
  }, [byId, fin, day])

  // En vivo primero: las canchas con partido en juego van arriba (cada una ya viene ordenada por número)
  const liveCourts = courts.filter((c) => c.list.some((m) => m.status === 'LIVE'))
  const liveCount = liveCourts.reduce((n, c) => n + c.list.filter((m) => m.status === 'LIVE').length, 0)
  const current = sel === 'live' ? null : courts.find((c) => c.court === sel)
  const shown = sel === 'live' ? liveCourts : current ? [current] : liveCourts

  // Relojes: los partidos en vivo de lo que se está viendo
  const liveKey = shown.flatMap((c) => c.list.filter((m) => m.status === 'LIVE').map((m) => m.id)).sort().join(',')
  useEffect(() => {
    const ids = liveKey ? liveKey.split(',') : []
    const join = () => ids.forEach((id) => socket.emit('match:join', { matchId: id }))
    const onTick = (p) => setTicks((t) => ({ ...t, [p.matchId]: p }))
    if (socket.connected) join()
    socket.on('connect', join)
    socket.on('match:tick', onTick)
    return () => {
      ids.forEach((id) => socket.emit('match:leave', { matchId: id }))
      socket.off('connect', join)
      socket.off('match:tick', onTick)
    }
  }, [liveKey])

  // Ejecuta la acción y trae el partido actualizado (sets, marcador, estado)
  async function run(id, method, path, body) {
    setBusy(true); setErr('')
    try {
      await api(method, '/matches/' + id + path, body)
      upsert(await api('GET', '/matches/' + id))
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const chip = (on) => 'rounded-full border px-3 py-1.5 text-xs font-bold ' + (on ? 'border-accent bg-accent text-black' : 'border-line bg-surface')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Dashboard de canchas</h1>
        <Link to="/admin/jornada" className="rounded-full bg-accent px-4 py-1.5 text-xs font-extrabold text-black">Armar jornada</Link>
      </div>
      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface px-2 py-1.5">
        <button aria-label="Día anterior" onClick={() => setDay(shiftDay(day, -1))} className="grid h-9 w-9 place-items-center rounded-full bg-surface-2"><ChevronLeft size={18} /></button>
        <button onClick={() => setDay(dayOf(new Date().toISOString()))} className="text-sm font-extrabold">{dayTab(day)}</button>
        <button aria-label="Día siguiente" onClick={() => setDay(shiftDay(day, 1))} className="grid h-9 w-9 place-items-center rounded-full bg-surface-2"><ChevronRight size={18} /></button>
      </div>
      {dayVenues.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
          <MapPin size={14} className="text-accent" />
          {dayVenues.map((v) => <span key={v.name} className="rounded-full border border-line bg-surface px-2.5 py-1">{v.name} · {v.n}</span>)}
        </div>
      )}
      {loading && <Skeleton />}
      {error && <p className="text-danger">{error}</p>}
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {!loading && !error && courts.length === 0 && <p className="text-muted">No hay partidos con horario para este día.</p>}

      {courts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSel('live')} className={chip(sel === 'live')}>En vivo{liveCount ? ' · ' + liveCount : ''}</button>
          {courts.map((c) => (
            <button key={c.court} onClick={() => setSel(c.court)} className={chip(sel === c.court)}>
              {courtLabel(c.court)}{c.list.some((m) => m.status === 'LIVE') ? ' · En vivo' : ''}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-6">
        {sel === 'live' && liveCourts.length === 0 && courts.length > 0 && (
          <div className="rounded-2xl border border-line bg-surface p-6 text-center text-muted">No hay partidos en vivo. Elegí una cancha para ver los que siguen.</div>
        )}
        {sel === 'live'
          ? liveCourts.map((c) => <LiveCourt key={c.court} c={c} ticks={ticks} run={run} busy={busy} />)
          : shown.map((c) => <CourtSection key={c.court} c={c} ticks={ticks} run={run} busy={busy} title={false} />)}
      </div>
    </div>
  )
}
