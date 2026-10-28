import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Pin, PinOff, X } from 'lucide-react'
import { socket } from '../../sockets/socket'
import { api } from '../../lib/api'
import { useMatchesFeed } from '../../hooks/useMatchesFeed'
import { useMatchesStore } from '../../stores/matchesStore'
import { fmtWhen, courtLabel, phaseCmp } from '../../lib/format'
import StatusPill from '../../components/StatusPill'
import Versus from '../../components/Versus'
import MatchNotice from '../../components/MatchNotice'
import { Btn, Alert } from '../../components/ui'
import { matchInfo } from '../../lib/matchInfo'
import { statusBorder } from '../../lib/statusStyle'
import { usePipClock } from '../../hooks/usePipClock'

const ORDER = { LIVE: 0, READY: 1, SCHEDULED: 2 }
const pad = (t) => (t ? t.replace(/^(\d):/, '0$1:') : '--:--')

// Partido de la cancha con acciones rápidas para la organización
function CourtMatch({ m, tick, full, run, busy }) {
  const [confirm, setConfirm] = useState(false)
  const pip = usePipClock(m)
  const paused = m.status === 'LIVE' && tick?.isMatchPaused
  const open = m.status === 'READY' || m.status === 'LIVE'
  const sets = m.sets ?? []
  const isCloth = m.modality === 'CLOTH'
  const center = m.status === 'LIVE' || sets.length ? (
    <div className="flex flex-col items-center gap-1">
      <span className="font-mono text-4xl font-extrabold tabular-nums">{m.score?.teamA ?? 0} - {m.score?.teamB ?? 0}</span>
      {m.status === 'LIVE' && <span className="font-mono text-lg font-extrabold tabular-nums text-accent">{pad(tick?.matchTime)}</span>}
      {m.status === 'LIVE' && tick?.matchHalf && (
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{Number(tick.matchHalf) === 2 ? '2do tiempo' : '1er tiempo'}</span>
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
        {open && (
          <>
            <p className="col-span-2 -mb-1 text-sm font-semibold">Set ganado por</p>
            {[m.teamA, m.teamB].map((t, i) => (
              <Btn key={i} disabled={busy || !t} onClick={() => run(m.id, 'POST', '/sets', { winnerTeamId: t.id })}>{t?.name ?? 'Por definir'}</Btn>
            ))}
            {isCloth && <Btn className="col-span-2" disabled={busy} onClick={() => run(m.id, 'POST', '/sets', { draw: true })}>Empate</Btn>}
          </>
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
                <button aria-label="Quitar set" disabled={busy} onClick={() => run(m.id, 'DELETE', '/sets/' + s.number)} className="text-danger"><X size={16} /></button>
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

export default function DashboardPage() {
  useMatchesFeed()
  const { byId, loading, error, upsert } = useMatchesStore()
  const [ticks, setTicks] = useState({})
  const [sel, setSel] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const courts = useMemo(() => {
    const groups = {}
    Object.values(byId)
      .filter((m) => m.status in ORDER)
      .forEach((m) => { (groups[m.court ?? 0] ??= []).push(m) })
    return Object.entries(groups)
      .map(([court, list]) => {
        list.sort((a, b) => ORDER[a.status] - ORDER[b.status] || String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? '')) || phaseCmp(a, b))
        return { court: Number(court), list }
      })
      .sort((a, b) => (a.court || 999) - (b.court || 999))
  }, [byId])

  // Cancha elegida: la que el organizador tocó o, por defecto, la primera con partido en vivo
  const current = courts.find((c) => c.court === sel) ?? courts.find((c) => c.list[0]?.status === 'LIVE') ?? courts[0]

  // Relojes: solo el partido en vivo de la cancha elegida
  const liveId = current?.list[0]?.status === 'LIVE' ? current.list[0].id : ''
  useEffect(() => {
    const join = () => liveId && socket.emit('match:join', { matchId: liveId })
    const onTick = (p) => setTicks((t) => ({ ...t, [p.matchId]: p }))
    if (socket.connected) join()
    socket.on('connect', join)
    socket.on('match:tick', onTick)
    return () => {
      if (liveId) socket.emit('match:leave', { matchId: liveId })
      socket.off('connect', join)
      socket.off('match:tick', onTick)
    }
  }, [liveId])

  // Ejecuta la acción y trae el partido actualizado (sets, marcador, estado)
  async function run(id, method, path, body) {
    setBusy(true); setErr('')
    try {
      await api(method, '/matches/' + id + path, body)
      upsert(await api('GET', '/matches/' + id))
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Dashboard de canchas</h1>
      {loading && <p className="text-muted">Cargando…</p>}
      {error && <p className="text-danger">{error}</p>}
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {!loading && !error && courts.length === 0 && <p className="text-muted">No hay partidos activos.</p>}

      {courts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {courts.map((c) => (
            <button
              key={c.court}
              onClick={() => setSel(c.court)}
              className={'rounded-full border px-3 py-1.5 text-xs font-bold ' + (current?.court === c.court ? 'border-accent bg-accent text-black' : 'border-line bg-surface')}
            >
              {courtLabel(c.court)}{c.list[0]?.status === 'LIVE' ? ' · En vivo' : ''}
            </button>
          ))}
        </div>
      )}

      {current && (
        <div className="space-y-4">
          {current.list.map((m, i) => (
            <div key={m.id} className="space-y-2">
              {i === 1 && <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Próximos en {courtLabel(current.court)}</h2>}
              <CourtMatch m={m} tick={ticks[m.id]} full={i === 0} run={run} busy={busy} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
