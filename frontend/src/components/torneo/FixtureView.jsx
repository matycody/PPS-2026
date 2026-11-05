import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { useConfirm } from '../ConfirmProvider'
import { api } from '../../lib/api'
import { socket } from '../../sockets/socket'
import { fmtWhen, courtLabel } from '../../lib/format'
import { Btn, Alert, inputCls } from '../ui'
import StatusPill from '../StatusPill'
import MatchNotice from '../MatchNotice'

// Fila de un partido: equipos (o lugar por definir), marcador, hora, cancha y estado
export function MatchRow({ m, base, footer }) {
  return (
    <div className={'rounded-2xl bg-surface-2 px-3 py-2 text-sm' + (m.paused ? ' opacity-70' : '')}>
      <Link to={base + m.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* En el celular los equipos ocupan toda la línea y el horario y el estado van debajo; en pantallas grandes, todo en una fila */}
        <span className="w-full min-w-0 font-semibold sm:w-auto sm:flex-1 sm:truncate">
          {m.teamA?.name ?? m.fromA?.label ?? '—'}
          {m.score && (m.status === 'FINISHED' || m.status === 'LIVE')
            ? <b className="mx-1.5 rounded-lg bg-surface px-2 py-0.5 font-mono tabular-nums">{m.score.teamA} - {m.score.teamB}</b>
            : ' vs '}
          {m.teamB?.name ?? m.fromB?.label ?? '—'}
        </span>
        <span className="min-w-0 text-xs text-muted sm:shrink-0">{m.scheduledAt ? fmtWhen(m.scheduledAt, m.timeSet) : 'Sin programación'} · {m.venue ? m.venue.name + ' · ' : ''}{courtLabel(m.court)}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {m.paused && <span className="rounded-full bg-warn/20 px-2 py-0.5 text-xs font-bold uppercase text-warn">Pausado</span>}
          <StatusPill status={m.status} />
        </span>
      </Link>
      <MatchNotice m={m} compact className="mt-1" />
      {footer}
    </div>
  )
}

// urls: para rondas de playoffs, { date, assign } reemplaza a los de la jornada del fixture
export function MatchdayCard({ md, zone, tournamentId, admin, base, onChanged, setErr, urls, onDate, siblings }) {
  const [date, setDate] = useState(md.date ? md.date.slice(0, 10) : '')
  const [courts, setCourts] = useState(1)
  const [busy, setBusy] = useState(false)
  const ask = useConfirm()

  async function run(fn) {
    setBusy(true); setErr('')
    try { await fn(); await onChanged() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const saveDate = () => run(() => api('PATCH', urls?.date ?? '/tournaments/' + tournamentId + '/matchdays/' + md.id, {
    date: date ? date + 'T15:00:00.000Z' : null,
  }))
  const assign = () => run(() => api('POST', urls?.assign ?? '/tournaments/' + tournamentId + '/matchdays/' + md.id + '/assign-courts', {
    courts: Number(courts),
  }))

  // Mover un partido a otra fecha de la misma zona: el servidor avisa si un equipo ya juega en esa fecha
  const moveTo = (m, matchdayId) => run(() => api('PATCH', '/matches/' + m.id, { matchdayId }))
  const dropEmpty = () => run(() => api('DELETE', '/tournaments/' + tournamentId + '/matchdays/' + md.id))
  // Orden de juego dentro de la fecha: sube o baja un lugar
  const shift = (i, d) => run(() => {
    const ids = md.matches.map((x) => x.id)
    ;[ids[i], ids[i + d]] = [ids[i + d], ids[i]]
    return api('PUT', '/tournaments/' + tournamentId + '/matchdays/' + md.id + '/order', { matchIds: ids })
  })
  // Eliminar un partido de la fecha (se oculta y se borra definitivamente)
  async function remove(m) {
    const nom = (m.teamA?.name ?? 'Por definir') + ' vs ' + (m.teamB?.name ?? 'Por definir')
    if (!(await ask({ title: 'Eliminar partido', message: '¿Eliminar ' + nom + '? No se puede deshacer.', confirmText: 'Eliminar', danger: true }))) return
    await run(async () => { await api('POST', '/matches/' + m.id + '/hide'); await api('DELETE', '/matches/' + m.id + '/purge') })
  }
  const others = (siblings ?? []).filter((x) => x.id !== md.id)

  return (
    <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <p className="text-sm font-bold">
        {zone ?? 'Fecha ' + md.number}
        <span className="ml-2 font-normal text-muted">{md.date ? new Date(md.date).toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }) : 'Sin día'}</span>
      </p>
      {admin && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">Día
            <input type="date" className={inputCls} value={date} onChange={(e) => { setDate(e.target.value); onDate?.(md.id, e.target.value) }} />
          </label>
          <Btn onClick={saveDate} disabled={busy}>Guardar día</Btn>
          <label className="w-24 text-xs text-muted">Canchas
            <input type="number" min="1" className={inputCls} value={courts} onChange={(e) => setCourts(e.target.value)} />
          </label>
          <Btn onClick={assign} disabled={busy}>Asignar canchas</Btn>
        </div>
      )}
      <div className="space-y-2">
        {md.matches.map((m, i) => {
          const canMove = admin && !urls && others.length > 0 && (m.status === 'SCHEDULED' || m.status === 'READY')
          const canDelete = ['SCHEDULED', 'FINISHED', 'CANCELLED'].includes(m.status)
          const footer = admin && !urls ? (
            <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
              {canMove
                ? (
                  <select className={inputCls + ' !min-h-0 !bg-surface min-w-0 flex-1 !py-1.5 text-xs'} value="" disabled={busy} onChange={(e) => e.target.value && moveTo(m, e.target.value)} aria-label="Mover el partido a otra fecha">
                    <option value="">Mover a otra fecha…</option>
                    {others.map((x) => <option key={x.id} value={x.id}>Fecha {x.number}</option>)}
                  </select>
                )
                : <span className="flex-1" />}
              <div className="flex shrink-0 items-center rounded-xl bg-surface">
                <button type="button" aria-label="Subir" disabled={busy || i === 0} onClick={() => shift(i, -1)} className="p-2 disabled:opacity-30"><ChevronUp size={18} /></button>
                <button type="button" aria-label="Bajar" disabled={busy || i === md.matches.length - 1} onClick={() => shift(i, 1)} className="p-2 disabled:opacity-30"><ChevronDown size={18} /></button>
                {canDelete && <button type="button" aria-label="Eliminar partido" disabled={busy} onClick={() => remove(m)} className="p-2 text-danger disabled:opacity-30"><X size={18} /></button>}
              </div>
            </div>
          ) : null
          return <MatchRow key={m.id} m={m} base={base} footer={footer} />
        })}
        {admin && !urls && md.matches.length === 0 && (
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted">Fecha vacía: sumale partidos con "Agregar partido al torneo" o quitala.</p>
            <Btn tone="danger" onClick={dropEmpty} disabled={busy}>Quitar fecha</Btn>
          </div>
        )}
      </div>
    </div>
  )
}

export default function FixtureView({ tournamentId, admin = false, base = '/partido/', reloadKey, onLoaded }) {
  const [days, setDays] = useState(null)
  const [err, setErr] = useState('')
  const [drafts, setDrafts] = useState({}) // día elegido en cada fecha, aún sin guardar: { matchdayId: 'YYYY-MM-DD' }
  const [savingDays, setSavingDays] = useState(false)

  const load = () => api('GET', '/tournaments/' + tournamentId + '/matchdays')
    .then((d) => { setDays(d); onLoaded?.(d) })
    .catch((e) => setErr(e.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [tournamentId, reloadKey])

  // Los marcadores se actualizan solos cuando cambia un partido (se espera un instante para agrupar cambios seguidos)
  useEffect(() => {
    let t
    const onUpdated = () => { clearTimeout(t); t = setTimeout(load, 1200) }
    socket.emit('matches:subscribe')
    socket.on('match:updated', onUpdated)
    return () => { clearTimeout(t); socket.off('match:updated', onUpdated); socket.emit('matches:unsubscribe') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])

  if (!days) return err ? <p className="text-danger">{err}</p> : <p className="text-muted">Cargando…</p>
  if (!days.length) return <p className="text-muted">Todavía no hay fixture.</p>

  const byStage = []
  for (const d of days) {
    let g = byStage.find((x) => x.id === d.stage.id)
    if (!g) byStage.push((g = { id: d.stage.id, name: d.stage.name, days: [] }))
    g.days.push(d)
  }
  const card = (md, zone) => (
    <MatchdayCard key={md.id} md={md} zone={zone} tournamentId={tournamentId} admin={admin} base={base} onChanged={load} setErr={setErr}
      siblings={days.filter((x) => x.stage.id === md.stage.id)}
      onDate={(id, v) => setDrafts((d) => ({ ...d, [id]: v }))} />
  )

  // Guardar de una vez los días de todas las fechas que se cambiaron (sin tocar canchas)
  const pending = days.filter((d) => drafts[d.id] !== undefined && drafts[d.id] !== (d.date ? d.date.slice(0, 10) : ''))
  async function saveAllDays() {
    setSavingDays(true); setErr('')
    try {
      for (const d of pending) {
        const v = drafts[d.id]
        await api('PATCH', '/tournaments/' + tournamentId + '/matchdays/' + d.id, { date: v ? v + 'T15:00:00.000Z' : null })
      }
      await load()
    } catch (e) { setErr(e.message); await load().catch(() => {}) } finally { setSavingDays(false) }
  }
  const bulk = admin && days.length > 1 && (
    <Btn tone="accent" className="w-full" disabled={savingDays || pending.length === 0} onClick={saveAllDays}>
      {savingDays ? 'Guardando días…' : pending.length ? 'Guardar días de todas las fechas (' + pending.length + ')' : 'Guardar días de todas las fechas'}
    </Btn>
  )

  // Una sola zona: la lista de fechas de siempre
  if (byStage.length === 1) {
    return (
      <div className="space-y-5">
        {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
        {bulk}
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">{byStage[0].name}</p>
          {byStage[0].days.map((md) => card(md))}
        </div>
      </div>
    )
  }

  // Varias zonas: primero la Fecha 1 de todas las zonas, después la Fecha 2, etc.
  const order = new Map(byStage.map((g, i) => [g.id, i]))
  const numbers = [...new Set(days.map((d) => d.number))].sort((a, b) => a - b)
  return (
    <div className="space-y-6">
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {bulk}
      {numbers.map((n) => (
        <div key={n} className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Fecha {n}</p>
          {days.filter((d) => d.number === n).sort((a, b) => order.get(a.stage.id) - order.get(b.stage.id)).map((md) => card(md, md.stage.name))}
        </div>
      ))}
    </div>
  )
}

// Rondas de playoffs (Octavos, Cuartos, Semifinales, Final) con día y canchas, igual que las jornadas del fixture
export function PlayoffsSchedule({ tournamentId, stages, base = '/partido/', reloadKey }) {
  const [data, setData] = useState([])
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0)
  const ids = stages.map((x) => x.id).join()
  useEffect(() => {
    let alive = true
    Promise.all(stages.map((st) =>
      api('GET', '/tournaments/' + tournamentId + '/stages/' + st.id + '/bracket').then((b) => ({ stage: st, rounds: b.rounds })),
    )).then((r) => { if (alive) setData(r) }).catch((e) => alive && setErr(e.message))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, ids, reloadKey, tick])

  const shown = data.filter((d) => d.rounds.length)
  if (!shown.length) return err ? <p className="text-danger">{err}</p> : null
  return (
    <div className="space-y-4">
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {shown.map(({ stage, rounds }) => (
        <div key={stage.id} className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Playoffs · {stage.name}</p>
          {rounds.map((r) => {
            const dates = r.matches.map((m) => m.scheduledAt).filter(Boolean).sort()
            const md = { id: stage.id + ':' + r.round, date: dates[0] ?? null, matches: r.matches }
            return (
              <MatchdayCard
                key={md.id + (md.date ?? '')}
                md={md}
                zone={r.name}
                tournamentId={tournamentId}
                admin
                base={base}
                setErr={setErr}
                onChanged={() => setTick((x) => x + 1)}
                urls={{
                  date: '/tournaments/' + tournamentId + '/stages/' + stage.id + '/bracket/rounds/' + r.round,
                  assign: '/tournaments/' + tournamentId + '/stages/' + stage.id + '/bracket/rounds/' + r.round + '/assign-courts',
                }}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
