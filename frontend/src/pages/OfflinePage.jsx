import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Minus, Plus, X, WifiOff, Volume2, VolumeX } from 'lucide-react'
import { MODALITY } from '../lib/format'
import { play, unlockAudio, isMuted, setMuted, setSoundAllowed } from '../lib/sound'
import { useWakeLock } from '../hooks/useWakeLock'

const DEFAULTS = { match: 20 * 60, set: 3 * 60 }

// --- Persistencia: el cronometro offline conserva sus valores al recargar la pagina ---
const loadJson = (key, fallback) => {
  try {
    const s = localStorage.getItem(key)
    return s === null ? fallback : JSON.parse(s)
  } catch { return fallback }
}
const saveJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* sin localStorage */ }
}
function usePersisted(key, initial) {
  const [v, setV] = useState(() => loadJson(key, initial))
  useEffect(() => { saveJson(key, v) }, [key, v])
  return [v, setV]
}
// Un reloj que estaba corriendo sigue contando (usa su hora de fin); si ya vencio, queda en 00:00
function restoreClock(key, initialSec) {
  const s = loadJson(key, null)
  if (!s || typeof s.left !== 'number') return { left: initialSec * 1000, endAt: null }
  if (typeof s.endAt === 'number') {
    return s.endAt > Date.now() ? { left: s.left, endAt: s.endAt } : { left: 0, endAt: null }
  }
  return { left: s.left, endAt: null }
}
const CLOTH_RESET_SEC = 90 // Cloth: el reloj del partido vuelve a 01:30
const CLOTH_LIMIT_MS = 2 * 60 * 1000 // ...si le quedan menos de 2 min
const MSG = {
  set: 'SET TERMINADO',
  sudden: 'MUERTE SÚBITA (NO HAY ESCUDO)',
  end: 'SE TERMINÓ EL PARTIDO',
}

const fmt = (ms) => {
  const s = Math.ceil(ms / 1000)
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}
// Acepta "530", "0530" o "5:30" (igual que el input mmss del Sprint 1)
const parseDigits = (v) => {
  const d = v.replace(/\D/g, '').slice(0, 4)
  if (!d) return null
  const p = d.padStart(4, '0')
  return Number(p.slice(0, 2)) * 60 + Number(p.slice(2))
}

// Reloj local basado en Date.now(): no se desfasa si la pestaña queda en segundo plano
function useClock(storageKey, initialSec, onZero) {
  const [c, setC] = useState(() => restoreClock(storageKey, initialSec))
  const [, force] = useState(0)
  const ref = useRef(c)
  ref.current = c
  const cb = useRef(onZero)
  cb.current = onZero

  useEffect(() => { saveJson(storageKey, c) }, [storageKey, c])

  useEffect(() => {
    const id = setInterval(() => {
      const cur = ref.current
      if (cur.endAt && Date.now() >= cur.endAt) {
        setC({ left: 0, endAt: null }) // se congela en 00:00 hasta reinicio manual
        cb.current?.()
      }
      force((n) => n + 1)
    }, 200)
    return () => clearInterval(id)
  }, [])

  const running = !!c.endAt
  const left = running ? Math.max(0, c.endAt - Date.now()) : c.left
  const put = (ms, run) => setC({ left: ms, endAt: run ? Date.now() + ms : null })

  return {
    left,
    running,
    start: () => left > 0 && put(left, true),
    pause: () => put(left, false),
    reset: (sec) => put(sec * 1000, false),
    adjust: (sec) => {
      const next = Math.max(0, left + sec * 1000)
      put(next, running && next > 0)
    },
    setSeconds: (sec) => put(sec * 1000, false),
    startFrom: (sec) => put(sec * 1000, true),
  }
}

function Btn({ children, onClick, disabled, tone = 'base', className = '' }) {
  const tones = {
    base: 'border border-line bg-surface-2',
    accent: 'bg-accent text-black',
    live: 'bg-live text-black',
    danger: 'bg-danger text-white',
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

function ClockCard({ label, clock, defaultSec, color, locked }) {
  const [val, setVal] = useState('')
  const apply = () => {
    const s = parseDigits(val)
    if (s == null) return
    clock.setSeconds(s)
    setVal('')
  }
  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">{label}</p>
        <span className={'shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold uppercase sm:px-2.5 sm:text-[11px] ' + (clock.running ? 'bg-live/15 text-live' : 'bg-danger/15 text-danger')}>
          {clock.running ? 'En marcha' : 'Pausado'}
        </span>
      </div>
      <p className={'my-3 text-center font-mono text-[clamp(2rem,10.5vw,3.75rem)] font-extrabold tabular-nums ' + color}>{fmt(clock.left)}</p>
      <div className="grid grid-cols-2 gap-2">
        <Btn tone={clock.running ? 'base' : 'live'} onClick={clock.running ? clock.pause : clock.start} disabled={locked || (!clock.running && clock.left === 0)} className="col-span-2">
          {clock.running ? <Pause size={18} /> : <Play size={18} />} {clock.running ? 'Pausar' : 'Iniciar'}
        </Btn>
        <Btn onClick={() => clock.adjust(-10)}><Minus size={16} /> 10s</Btn>
        <Btn onClick={() => clock.adjust(10)}><Plus size={16} /> 10s</Btn>
        <Btn onClick={() => clock.reset(defaultSec)} className="col-span-2"><RotateCcw size={16} /> Reset</Btn>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="mmss"
          inputMode="numeric"
          className="min-w-0 flex-1 rounded-2xl border border-line bg-bg px-4 py-3 text-center font-mono outline-none focus:border-accent"
        />
        <Btn disabled={parseDigits(val) == null} onClick={apply}>Set</Btn>
      </div>
    </div>
  )
}

export default function OfflinePage() {
  const [modality, setModality] = usePersisted('cron:modality', 'FOAM')
  const [half, setHalf] = usePersisted('cron:half', 1)
  const [notices, setNotices] = useState([])
  const isCloth = modality === 'CLOTH'
  const [muted, setMutedState] = useState(isMuted())
  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    setMutedState(next)
    if (!next) play('test')
  }
  const push = (t) => setNotices((n) => [...n, { k: Date.now() + Math.random(), t }])

  // Reloj del partido en 0: Foam avisa muerte súbita; Cloth no avisa nada
  const matchClock = useClock('cron:match', DEFAULTS.match, () => {
    play('match')
    if (!isCloth) push(MSG.sudden)
  })

  // Reloj del set en 0: queda congelado hasta reinicio manual (ambas modalidades)
  const setClock = useClock('cron:set', DEFAULTS.set, () => {
    play('set')
    push(isCloth ? MSG.set : MSG.sudden)
    if (isCloth && matchClock.left > 0 && matchClock.left < CLOTH_LIMIT_MS) {
      matchClock.reset(CLOTH_RESET_SEC) // vuelve a 01:30 y queda pausado
    }
  })

    // --- Tiempo muerto: 1 min, 1 por equipo y por tiempo ---
  const TIMEOUT_SEC = 60
  const EMPTY_USED = { A: { 1: false, 2: false }, B: { 1: false, 2: false } }
  const [used, setUsed] = usePersisted('cron:used', EMPTY_USED)
  const [tmTeam, setTmTeam] = usePersisted('cron:tmTeam', null)
  const resume = useRef(loadJson('cron:resume', { match: false, set: false }))

  const timeoutClock = useClock('cron:timeout', TIMEOUT_SEC, () => {
    play('timeout')
    push('TIEMPO MUERTO TERMINADO')
    navigator.vibrate?.([300, 100, 300])
  })

  const pedirTiempo = (team) => {
    if (tmTeam || used[team][half]) return
    resume.current = { match: matchClock.running, set: setClock.running }
    saveJson('cron:resume', resume.current)
    pauseBoth()
    setUsed((u) => ({ ...u, [team]: { ...u[team], [half]: true } }))
    setTmTeam(team)
    timeoutClock.startFrom(TIMEOUT_SEC)
  }

  const endTimeout = () => {
    timeoutClock.reset(TIMEOUT_SEC)
    setTmTeam(null)
    if (resume.current.match) matchClock.start()
    if (resume.current.set) setClock.start()
  }
  const anyRunning = matchClock.running || setClock.running
  useWakeLock(anyRunning || !!tmTeam)
  // Si al recargar hay relojes corriendo, el navegador pide un toque para habilitar el sonido
  const restoredNotice = useRef(false)
  useEffect(() => {
    if (restoredNotice.current) return
    restoredNotice.current = true
    if (matchClock.running || setClock.running || timeoutClock.running) {
      push('Cron\u00f3metro restaurado. Toc\u00e1 la pantalla para activar el sonido.')
    }
  }, [])
  useEffect(() => { setSoundAllowed(true); return () => setSoundAllowed(false) }, [])
  const startBoth = () => { matchClock.start(); setClock.start() }
  const pauseBoth = () => { matchClock.pause(); setClock.pause() }
  const resetAll = () => {
    matchClock.reset(DEFAULTS.match)
    setClock.reset(DEFAULTS.set)
    setHalf(1)
    setNotices([])
    setUsed(EMPTY_USED); setTmTeam(null); timeoutClock.reset(TIMEOUT_SEC)
  }

  // Finalizar tiempo: pausa ambos. 1er -> 2do tiempo; en el 2do, reinicia todo y vuelve al 1er tiempo
  const finish = () => {
    pauseBoth()
    matchClock.reset(DEFAULTS.match)
    setClock.reset(DEFAULTS.set)
    if (half === 1) {
      setHalf(2)
    } else {
      setHalf(1)
      push(MSG.end)
      setUsed(EMPTY_USED)
    }
  }
  const showFinish = isCloth || matchClock.left <= 0

  return (
    <div className="space-y-4" onPointerDown={unlockAudio}>
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <WifiOff size={16} className="shrink-0" />
        Cronómetro offline: funciona en este dispositivo, sin conexión y sin sincronizarse con nadie.
      </div>

            <button onClick={toggleMute} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm font-extrabold">
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />} {muted ? 'Sonido silenciado (tocar para activar)' : 'Sonido activado (tocar para silenciar)'}
      </button>

      {notices.map((n) => (
        <button key={n.k} onClick={() => setNotices((l) => l.filter((x) => x.k !== n.k))} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-left text-sm font-bold text-warn">
          {n.t} <X size={16} className="shrink-0" />
        </button>
      ))}

      <div className="grid grid-cols-2 gap-3">
        <ClockCard label="Partido" clock={matchClock} defaultSec={DEFAULTS.match} color="text-accent" locked={!!tmTeam} />
        <ClockCard label="Set" clock={setClock} defaultSec={DEFAULTS.set} color="text-live" locked={!!tmTeam} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Btn tone={anyRunning ? 'danger' : 'live'} onClick={anyRunning ? pauseBoth : startBoth} disabled={!anyRunning && !!tmTeam}>
          {anyRunning ? <Pause size={18} /> : <Play size={18} />} {anyRunning ? 'Pausar ambos' : 'Iniciar ambos'}
        </Btn>
        <Btn onClick={resetAll}><RotateCcw size={16} /> Reiniciar todo</Btn>
      </div>

            <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Tiempo muerto (1 por equipo y por tiempo)</p>
        {!tmTeam ? (
          <div className="grid grid-cols-2 gap-2">
            {['A', 'B'].map((tm) => (
              <Btn key={tm} disabled={used[tm][half]} onClick={() => pedirTiempo(tm)}>
                Equipo {tm} {used[tm][half] ? '(usado)' : ''}
              </Btn>
            ))}
          </div>
        ) : (
          <>
            <p className="text-center text-xs font-bold uppercase text-muted">Equipo {tmTeam}</p>
            <p className={'text-center font-mono text-6xl font-extrabold tabular-nums ' + (timeoutClock.left === 0 ? 'text-danger' : 'text-warn')}>
              {fmt(timeoutClock.left)}
            </p>
            <Btn tone={timeoutClock.left === 0 ? 'live' : 'base'} onClick={endTimeout} className="w-full">
              {timeoutClock.left === 0 ? 'Reanudar' : 'Terminar tiempo y reanudar'}
            </Btn>
          </>
        )}
      </div>
      {showFinish && (
        <Btn tone="danger" onClick={finish} className="w-full py-4">
          {half === 2 ? 'Finalizar partido' : 'Finalizar tiempo'}
        </Btn>
      )}

      <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Modalidad</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(MODALITY).map(([k, l]) => (
            <Btn key={k} tone={modality === k ? 'accent' : 'base'} onClick={() => setModality(k)}>{l}</Btn>
          ))}
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Tiempo</p>
        <div className="grid grid-cols-2 gap-2">
          <Btn tone={half === 1 ? 'accent' : 'base'} onClick={() => setHalf(1)}>1er tiempo</Btn>
          <Btn tone={half === 2 ? 'accent' : 'base'} onClick={() => setHalf(2)}>2do tiempo</Btn>
        </div>
      </div>
    </div>
  )
}








