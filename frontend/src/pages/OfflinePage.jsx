import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Minus, Plus, X, WifiOff } from 'lucide-react'
import { MODALITY } from '../lib/format'

const DEFAULTS = { match: 20 * 60, set: 3 * 60 }
const CLOTH_RESET_SEC = 90 // Cloth: el reloj del partido vuelve a 01:30
const CLOTH_LIMIT_MS = 3 * 60 * 1000 // ...si le quedan menos de 3 min
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
function useClock(initialSec, onZero) {
  const [c, setC] = useState({ left: initialSec * 1000, endAt: null })
  const [, force] = useState(0)
  const ref = useRef(c)
  ref.current = c
  const cb = useRef(onZero)
  cb.current = onZero

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

function ClockCard({ label, clock, defaultSec, color }) {
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
        <span className={'rounded-full px-2.5 py-1 text-[11px] font-bold uppercase ' + (clock.running ? 'bg-live/15 text-live' : 'bg-danger/15 text-danger')}>
          {clock.running ? 'En marcha' : 'Pausado'}
        </span>
      </div>
      <p className={'my-3 text-center font-mono text-6xl font-extrabold tabular-nums ' + color}>{fmt(clock.left)}</p>
      <div className="grid grid-cols-2 gap-2">
        <Btn tone={clock.running ? 'base' : 'live'} onClick={clock.running ? clock.pause : clock.start} disabled={!clock.running && clock.left === 0} className="col-span-2">
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
  const [modality, setModality] = useState('FOAM')
  const [half, setHalf] = useState(1)
  const [notices, setNotices] = useState([])
  const clothResetUsed = useRef({ 1: false, 2: false }) // una vez por tiempo
  const isCloth = modality === 'CLOTH'
  const push = (t) => setNotices((n) => [...n, { k: Date.now() + Math.random(), t }])

  // Reloj del partido en 0: Foam avisa muerte súbita; Cloth no avisa nada
  const matchClock = useClock(DEFAULTS.match, () => {
    if (!isCloth) push(MSG.sudden)
  })

  // Reloj del set en 0: queda congelado hasta reinicio manual (ambas modalidades)
  const setClock = useClock(DEFAULTS.set, () => {
    push(isCloth ? MSG.set : MSG.sudden)
    if (isCloth && matchClock.left > 0 && matchClock.left < CLOTH_LIMIT_MS && !clothResetUsed.current[half]) {
      clothResetUsed.current[half] = true
      matchClock.reset(CLOTH_RESET_SEC) // vuelve a 01:30 y queda pausado
    }
  })

  const anyRunning = matchClock.running || setClock.running
  const startBoth = () => { matchClock.start(); setClock.start() }
  const pauseBoth = () => { matchClock.pause(); setClock.pause() }
  const resetAll = () => {
    matchClock.reset(DEFAULTS.match)
    setClock.reset(DEFAULTS.set)
    clothResetUsed.current = { 1: false, 2: false }
    setHalf(1)
    setNotices([])
  }

  // Finalizar tiempo: pausa ambos y pasa al 2do tiempo; en el 2do, cierra el partido
  const finish = () => {
    pauseBoth()
    if (half === 1) setHalf(2)
    else push(MSG.end)
  }
  const showFinish = isCloth || matchClock.left <= 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <WifiOff size={16} className="shrink-0" />
        Cronómetro offline: funciona en este dispositivo, sin conexión y sin sincronizarse con nadie.
      </div>

      {notices.map((n) => (
        <button key={n.k} onClick={() => setNotices((l) => l.filter((x) => x.k !== n.k))} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-left text-sm font-bold text-warn">
          {n.t} <X size={16} className="shrink-0" />
        </button>
      ))}

      <div className="grid grid-cols-2 gap-3">
        <ClockCard label="Partido" clock={matchClock} defaultSec={DEFAULTS.match} color="text-accent" />
        <ClockCard label="Set" clock={setClock} defaultSec={DEFAULTS.set} color="text-live" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Btn tone={anyRunning ? 'danger' : 'live'} onClick={anyRunning ? pauseBoth : startBoth}>
          {anyRunning ? <Pause size={18} /> : <Play size={18} />} {anyRunning ? 'Pausar ambos' : 'Iniciar ambos'}
        </Btn>
        <Btn onClick={resetAll}><RotateCcw size={16} /> Reiniciar todo</Btn>
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
