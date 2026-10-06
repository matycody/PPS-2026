import SIRENA from './sirenaData.js'

let ctx = null
let buffer = null
let loading = null
let muted = false
let userChose = false
try {
  const s = localStorage.getItem('sound-muted')
  if (s !== null) { muted = s === '1'; userChose = true }
} catch { /* sin localStorage */ }

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function b64ToArrayBuffer(dataUri) {
  const bin = atob(dataUri.split(',')[1])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function load() {
  const c = getCtx()
  if (!c || buffer || loading) return
  loading = c.decodeAudioData(b64ToArrayBuffer(SIRENA))
    .then((b) => { buffer = b })
    .catch((e) => console.error('[sound] no se pudo decodificar', e))
    .finally(() => { loading = null })
}

// Mismo sonido (sirena), distinta duracion segun el evento (en segundos)
const DURATIONS = {
  match: 3,     // fin del tiempo del partido
  set: 2,       // fin del set
  timeout: 1.5, // fin del tiempo muerto
  test: 0.3,    // prueba al reactivar el sonido
}

// Si suenan dos avisos casi a la vez (fin de set y fin de partido), suena uno solo:
// gana el de mayor prioridad (partido > set > tiempo muerto).
const RANK = { match: 3, set: 2, timeout: 1, test: 0 }
const DEDUPE_SEC = 1
let current = null // { rank, at, src, gain }

export const unlockAudio = () => { load() }
export const isMuted = () => muted
export const setDefaultMuted = (v) => { if (!userChose) muted = v }
let allowed = false // solo mesa y arbitros (y el crono offline) pueden tener sonido
export const setSoundAllowed = (v) => { allowed = v }
export const isSoundAllowed = () => allowed
export const setMuted = (v) => {
  userChose = true
  muted = v
  try { localStorage.setItem('sound-muted', v ? '1' : '0') } catch { /* sin localStorage */ }
}

export function play(name) {
  if (muted || !allowed) return
  const c = getCtx()
  const want = DURATIONS[name]
  if (!c || !want) return
  if (!buffer) { load(); return }
  const now = c.currentTime
  const rank = RANK[name] ?? 0
  if (current && now - current.at < DEDUPE_SEC) {
    if (rank <= current.rank) return
    try {
      current.gain.gain.cancelScheduledValues(now)
      current.gain.gain.setValueAtTime(0.0001, now)
      current.src.stop(now)
    } catch { /* ya habia terminado */ }
  }
  const d = Math.min(want, buffer.duration)
  const src = c.createBufferSource()
  const gain = c.createGain()
  src.buffer = buffer
  gain.gain.setValueAtTime(1, now)
  gain.gain.setValueAtTime(1, now + Math.max(0, d - 0.08))
  gain.gain.linearRampToValueAtTime(0.0001, now + d)
  src.connect(gain).connect(c.destination)
  src.start(now, 0, d)
  current = { rank, at: now, src, gain }
}
