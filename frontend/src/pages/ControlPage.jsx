import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ChevronLeft, Play, Pause, RotateCcw, Minus, Plus, X } from 'lucide-react'
import { api } from '../lib/api'
import { socket } from '../sockets/socket'
import { normMatch, MODALITY } from '../lib/format'
import StatusPill from '../components/StatusPill'
import Versus from '../components/Versus'

const ACTIONS = {
  START: 'Iniciado', PAUSE: 'Pausado', RESUME: 'Reanudado', RESET: 'Reiniciado',
  ADJUST: 'Tiempo ajustado', SET_TIME: 'Tiempo fijado', SET_MODALITY: 'Modalidad cambiada',
  SET_HALF: 'Tiempo cambiado', FINISH_HALF: 'Tiempo finalizado',
}

// El backend manda "1:48"; se muestra "01:48"
const showTime = (t) => (t ? t.replace(/^(\d):/, '0$1:') : '--:--')

function parseMMSS(v) {
  const r = /^(\d{1,2}):?(\d{2})$/.exec(v.trim())
  return r ? Number(r[1]) * 60 + Number(r[2]) : null
}

function Btn({ children, onClick, disabled, tone = 'base', className = '' }) {
  const tones = {
    base: 'border border-line bg-surface-2',
    accent: 'bg-accent text-black',
    danger: 'bg-danger text-white',
    live: 'bg-live text-black',
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={'flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold disabled:opacity-40 ' + tones[tone] + ' ' + className}
    >
      {children}
    </button>
  )
}

function Clock({ label, timer, time, paused, can, send, color }) {
  const [val, setVal] = useState('')
  const apply = () => {
    const s = parseMMSS(val)
    if (s == null) return
    send('match:setTime', { timer, totalSeconds: s })
    setVal('')
  }
  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">{label}</p>
        <span className={'rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ' + (paused ? 'bg-danger/15 text-danger' : 'bg-live/15 text-live')}>
          {paused ? 'Pausado' : 'En marcha'}
        </span>
      </div>
      <p className={'my-3 text-center font-mono text-6xl font-extrabold tabular-nums ' + color}>{showTime(time)}</p>
      <div className="grid grid-cols-2 gap-2">
        <Btn
          disabled={!can}
          tone={paused ? 'live' : 'base'}
          onClick={() => send(paused ? 'match:resume' : 'match:pause', { target: timer })}
          className="col-span-2"
        >
          {paused ? <Play size={18} /> : <Pause size={18} />} {paused ? 'Reanudar' : 'Pausar'}
        </Btn>
        <Btn disabled={!can} onClick={() => send('match:adjust', { timer, seconds: -10 })}><Minus size={16} /> 10s</Btn>
        <Btn disabled={!can} onClick={() => send('match:adjust', { timer, seconds: 10 })}><Plus size={16} /> 10s</Btn>
        <Btn disabled={!can} onClick={() => send('match:reset', { timer })} className="col-span-2">
          <RotateCcw size={16} /> Reiniciar
        </Btn>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="MM:SS"
          inputMode="numeric"
          disabled={!can}
          className="min-w-0 flex-1 rounded-2xl border border-line bg-bg px-4 py-3 text-center font-mono outline-none focus:border-accent disabled:opacity-40"
        />
        <Btn disabled={!can || parseMMSS(val) == null} onClick={apply}>Fijar</Btn>
      </div>
    </div>
  )
}

export default function ControlPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [m, setM] = useState(null)
  const [tick, setTick] = useState(null)
  const [perms, setPerms] = useState(null)
  const [last, setLast] = useState(null)
  const [notices, setNotices] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmFinish, setConfirmFinish] = useState(false)

  const send = (event, extra = {}) => socket.emit(event, { matchId: id, ...extra })
  const pushNotice = (t) => setNotices((n) => [...n, { k: Date.now() + Math.random(), t }])

  useEffect(() => {
    api('GET', '/matches/' + id).then((x) => setM(normMatch(x))).catch((e) => setErr(e.message))
  }, [id])

  useEffect(() => {
    const join = () => {
      socket.emit('match:join', { matchId: id })
      socket.emit('match:controlJoin', { matchId: id })
    }
    const mine = (p) => p.matchId === id
    const onTick = (p) => mine(p) && setTick(p)
    const onPerms = (p) => mine(p) && setPerms(p)
    const onAction = (p) => mine(p) && setLast(p)
    const onError = (p) => setErr(p.message ?? 'Error')
    const onUpdated = (p) => (p.matchId ?? p.id) === id && setM((prev) => ({ ...prev, ...normMatch(p) }))
    const onMsg = (p) => mine(p) && pushNotice(p.message || 'SE TERMINÓ EL PARTIDO')

    socket.connect()
    if (socket.connected) join()
    socket.on('connect', join)
    socket.on('match:tick', onTick)
    socket.on('match:permissions', onPerms)
    socket.on('match:action', onAction)
    socket.on('match:error', onError)
    socket.on('match:updated', onUpdated)
    socket.on('match:setExpired', onMsg)
    socket.on('match:finished', onMsg)
    socket.on('match:ended', onMsg)

    return () => {
      socket.emit('match:controlLeave', { matchId: id })
      socket.emit('match:leave', { matchId: id })
      socket.off('connect', join)
      socket.off('match:tick', onTick)
      socket.off('match:permissions', onPerms)
      socket.off('match:action', onAction)
      socket.off('match:error', onError)
      socket.off('match:updated', onUpdated)
      socket.off('match:setExpired', onMsg)
      socket.off('match:finished', onMsg)
      socket.off('match:ended', onMsg)
    }
  }, [id])

  async function run(fn) {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!m) return <p className="mt-10 text-center text-muted">{err || 'Cargando…'}</p>

  const a = m.teamA
  const b = m.teamB
  const live = m.status === 'LIVE'
  const isCloth = m.modality === 'CLOTH'
  const can = !!perms?.canControlClock
  const half = Number(tick?.matchHalf)
  const matchAtZero = /^0{1,2}:00$/.test(tick?.matchTime ?? '')
  const hasTablePanel = perms && (perms.canReady || perms.canUnready || perms.canAddSets || perms.canEditResult || perms.canFinish)
  const addSet = (body) => run(() => api('POST', '/matches/' + id + '/sets', body))
  const act = (path) => run(async () => {
    const r = await api('POST', '/matches/' + id + path)
    if (r) setM((prev) => ({ ...prev, ...normMatch(r) }))
  })

  return (
    <div className="space-y-4">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft size={16} /> Volver
      </button>

      <div className="flex flex-col items-center gap-2 text-center">
        <StatusPill status={m.status} />
        <p className="text-sm text-muted">Cancha {m.court} · {MODALITY[m.modality] ?? m.modality}</p>
      </div>

      {err && (
        <button onClick={() => setErr('')} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-left text-sm font-bold text-danger">
          {err} <X size={16} className="shrink-0" />
        </button>
      )}
      {notices.map((n) => (
        <button key={n.k} onClick={() => setNotices((l) => l.filter((x) => x.k !== n.k))} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-left text-sm font-bold text-warn">
          {n.t} <X size={16} className="shrink-0" />
        </button>
      ))}

      <div className="rounded-3xl border border-line bg-surface p-5">
        <Versus
          a={a}
          b={b}
          size="lg"
          center={
            <span className="font-mono text-4xl font-extrabold tabular-nums text-accent">
              {m.score?.teamA ?? 0} <span className="text-lg text-muted">-</span> {m.score?.teamB ?? 0}
            </span>
          }
        />
        {last && (
          <p className="mt-3 text-center text-xs text-muted">
            Última acción: {ACTIONS[last.action] ?? last.action} por {last.by}
          </p>
        )}
      </div>

      {m.status === 'READY' && (
        <Btn
          tone="accent"
          disabled={!perms?.canControlClock}
          onClick={() => send('match:start', { target: 'both' })}
          className="w-full py-4 text-base"
        >
          <Play size={20} /> Iniciar partido
        </Btn>
      )}

      {m.status === 'SCHEDULED' && !perms?.canReady && (
        <p className="rounded-2xl border border-line bg-surface p-4 text-center text-sm text-muted">
          El partido todavía no está habilitado. La mesa tiene que habilitarlo.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Clock label="Partido" timer="match" time={tick?.matchTime} paused={tick?.isMatchPaused ?? true} can={can} send={send} color="text-accent" />
        <Clock label="Set" timer="set" time={tick?.setTime} paused={tick?.isSetPaused ?? true} can={can} send={send} color="text-live" />
      </div>

      {live && (
        <div className="grid grid-cols-2 gap-2">
          <Btn tone="live" disabled={!can} onClick={() => send('match:resume', { target: 'both' })}>
            <Play size={18} /> Iniciar ambos
          </Btn>
          <Btn tone="danger" disabled={!can} onClick={() => send('match:pause', { target: 'both' })}>
            <Pause size={18} /> Pausar ambos
          </Btn>
        </div>
      )}

      <div className="rounded-3xl border border-line bg-surface p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">Tiempo del partido</p>
        <div className="grid grid-cols-2 gap-2">
          <Btn disabled={!can} tone={half === 1 ? 'accent' : 'base'} onClick={() => send('match:setHalf', { half: 1 })}>1er tiempo</Btn>
          <Btn disabled={!can} tone={half === 2 ? 'accent' : 'base'} onClick={() => send('match:setHalf', { half: 2 })}>2do tiempo</Btn>
          {(isCloth || matchAtZero) && (
            <Btn disabled={!can} onClick={() => send('match:finishHalf')} className="col-span-2">
              {half === 2 ? 'Fin del partido (reloj)' : 'Finalizar tiempo'}
            </Btn>
          )}
        </div>
      </div>

      {hasTablePanel && (
        <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Mesa</p>

          {(perms.canReady || perms.canUnready) && (
            <div className="grid grid-cols-2 gap-2">
              <Btn tone="accent" disabled={busy || !perms.canReady} onClick={() => act('/ready')}>Habilitar partido</Btn>
              <Btn disabled={busy || !perms.canUnready} onClick={() => act('/unready')}>Deshabilitar partido</Btn>
            </div>
          )}

          {perms.canAddSets && (
            <div>
              <p className="mb-2 text-sm font-semibold">Set ganado por</p>
              <div className="grid grid-cols-2 gap-2">
                {[a, b].map((t, i) => (
                  <Btn key={i} disabled={busy || !t} onClick={() => addSet({ winnerTeamId: t.id })}>
                    {t?.name ?? 'Por definir'}
                  </Btn>
                ))}
                {isCloth && (
                  <Btn disabled={busy} onClick={() => addSet({ draw: true })} className="col-span-2">
                    Empate
                  </Btn>
                )}
              </div>
            </div>
          )}

          {(m.sets ?? []).length > 0 && (
            <ul className="space-y-1">
              {m.sets.map((s) => {
                const isDraw = s.draw === true || s.winnerTeamId == null
                const w = s.winnerTeamId === a?.id ? a : b
                return (
                  <li key={s.number} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
                    <span>Set {s.number}: <b>{isDraw ? 'Empate' : (w?.name ?? '—')}</b></span>
                    {perms.canEditResult && (
                      <button disabled={busy} onClick={() => run(() => api('DELETE', '/matches/' + id + '/sets/' + s.number))} className="text-danger">
                        <X size={16} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {perms.canFinish && !confirmFinish && (
            <Btn tone="danger" className="w-full" onClick={() => setConfirmFinish(true)}>Finalizar partido</Btn>
          )}
          {perms.canFinish && confirmFinish && (
            <div className="space-y-2 rounded-2xl border border-danger/40 bg-danger/10 p-3">
              <p className="text-sm font-bold text-danger">¿Finalizar el partido? Esta acción cierra el resultado.</p>
              <div className="grid grid-cols-2 gap-2">
                <Btn onClick={() => setConfirmFinish(false)}>Cancelar</Btn>
                <Btn tone="danger" disabled={busy} onClick={() => run(async () => { await api('POST', '/matches/' + id + '/finish'); setConfirmFinish(false) })}>
                  Sí, finalizar
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}



