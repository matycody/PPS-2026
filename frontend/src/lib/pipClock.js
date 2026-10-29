// Reloj flotante (Picture-in-Picture) de un partido, para quien mira sin controlar.
// Se dibuja en un canvas, se convierte en video y se manda a PiP: sigue visible al salir de la app.
//  - Android / Chrome / Edge: video.requestPictureInPicture()
//  - iOS / Safari: video.webkitSetPresentationMode('picture-in-picture')
// Los relojes avanzan solos entre un tick y otro (por si el navegador demora los eventos en segundo plano).

import { fmt, nowSec, pipNotice, halfLabel } from './pipTime'
import { startDocPip, docPipSupported } from './pipDocument'

let flick = 0
const W = 640
const H = 460
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export function pipSupported() {
  if (typeof document === 'undefined') return false
  if (docPipSupported()) return true
  if (typeof HTMLCanvasElement === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return false
  const v = document.createElement('video')
  const std = !!document.pictureInPictureEnabled && typeof v.requestPictureInPicture === 'function'
  const webkit = typeof v.webkitSetPresentationMode === 'function' && (typeof v.webkitSupportsPresentationMode !== 'function' || v.webkitSupportsPresentationMode('picture-in-picture'))
  return std || webkit
}

// Escudos: se cargan con CORS para no "ensuciar" el canvas; si fallan se dibuja la inicial
const logos = new Map()
function logoOf(url) {
  if (!url) return null
  let e = logos.get(url)
  if (!e) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    e = { img, ok: false }
    img.onload = () => { e.ok = true }
    img.onerror = () => { e.bad = true }
    img.src = url
    logos.set(url, e)
  }
  return e.ok ? e.img : null
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

function crest(ctx, cx, cy, r, team, color, halo) {
  if (halo) {
    ctx.beginPath()
    ctx.arc(cx, cy, r + 8, 0, Math.PI * 2)
    ctx.fillStyle = '#3a2c0c'
    ctx.fill()
  }
  const img = logoOf(team?.logo)
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  if (img) {
    ctx.fillStyle = '#222831'
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
    const k = Math.max((r * 2) / img.width, (r * 2) / img.height)
    ctx.drawImage(img, cx - (img.width * k) / 2, cy - (img.height * k) / 2, img.width * k, img.height * k)
  } else {
    ctx.fillStyle = '#222831'
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.lineWidth = 4
  ctx.strokeStyle = color
  ctx.stroke()
  if (!img) {
    ctx.fillStyle = '#e6eaf0'
    ctx.font = '600 ' + Math.round(r * 0.9) + 'px ' + SANS
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText((team?.name ?? '?').charAt(0).toUpperCase(), cx, cy + 2)
  }
}

function box(ctx, x, y, w, h, r, fill) {
  ctx.beginPath()
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h)
  ctx.fillStyle = fill
  ctx.fill()
}

// state: { m: partido, tick: último tick, at: cuándo llegó }
function draw(ctx, { m, tick, at }) {
  const nameA = m?.teamA?.name ?? 'Equipo A'
  const nameB = m?.teamB?.name ?? 'Equipo B'
  const cloth = m?.modality === 'CLOTH'
  const mPaused = tick?.isMatchPaused ?? true
  const sPaused = tick?.isSetPaused ?? true
  const mLeft = nowSec(tick?.matchTime, !mPaused, at)
  const sLeft = nowSec(tick?.setTime, !sPaused, at)
  // Finalizado solo si la mesa/árbitro lo finalizó o cerró; llegar a 00:00 no termina el partido
  const finished = m?.status === 'FINISHED' || !!tick?.matchEnded
  const notice = pipNotice(cloth, mLeft, sLeft, finished)
  const to = tick?.timeoutTeam
  const toRunning = !!tick?.isTimeoutRunning

  ctx.fillStyle = '#14171c'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'middle'

  // Modalidad y estado
  box(ctx, 24, 20, cloth ? 108 : 98, 34, 17, cloth ? '#3b2a5c' : '#1f3a5f')
  ctx.fillStyle = cloth ? '#cdb6ff' : '#9cc8ff'
  ctx.font = '600 18px ' + SANS
  ctx.textAlign = 'center'
  ctx.fillText(cloth ? 'CLOTH' : 'FOAM', 24 + (cloth ? 54 : 49), 38)
  if (!finished && tick?.matchHalf) {
    ctx.textAlign = 'center'
    ctx.font = '600 20px ' + SANS
    ctx.fillStyle = '#9aa4b2'
    ctx.fillText(halfLabel(tick), W / 2 - 10, 38)
  }
  ctx.textAlign = 'right'
  ctx.font = '600 20px ' + SANS
  ctx.fillStyle = finished ? '#9aa4b2' : '#ff6b6b'
  ctx.fillText(finished ? 'FINALIZADO' : 'EN VIVO', W - 24, 38)
  if (!finished) {
    ctx.beginPath()
    ctx.arc(W - 24 - ctx.measureText('EN VIVO').width - 14, 38, 6, 0, Math.PI * 2)
    ctx.fill()
  }

  // Equipos y marcador
  crest(ctx, 112, 130, 44, m?.teamA, '#4f86e8', to === 'A')
  crest(ctx, W - 112, 130, 44, m?.teamB, '#8a93a3', to === 'B')
  ctx.fillStyle = '#f2f4f7'
  ctx.font = '600 26px ' + SANS
  ctx.textAlign = 'center'
  ctx.fillText(fitText(ctx, nameA, 200), 112, 206)
  ctx.fillText(fitText(ctx, nameB, 200), W - 112, 206)
  box(ctx, W / 2 - 78, 98, 156, 66, 14, '#222831')
  ctx.fillStyle = '#f2f4f7' // box() deja el color del recuadro; sin esto el marcador queda del mismo color y no se ve
  ctx.font = '600 46px ' + MONO
  ctx.fillText((m?.score?.teamA ?? 0) + ' - ' + (m?.score?.teamB ?? 0), W / 2, 133)

  // Los dos relojes
  const dim = !!to
  const clock = (x, label, left, paused) => {
    box(ctx, x, 236, 288, 128, 16, '#1d222a')
    ctx.globalAlpha = dim ? 0.55 : 1
    ctx.fillStyle = '#9aa4b2'
    ctx.font = '600 20px ' + SANS
    ctx.textAlign = 'center'
    ctx.fillText(label + (finished ? ' · FINALIZADO' : paused ? ' · PAUSA' : ''), x + 144, 262)
    ctx.fillStyle = '#f2f4f7'
    ctx.font = '600 76px ' + MONO
    ctx.fillText(fmt(left), x + 144, 321)
    ctx.globalAlpha = 1
  }
  clock(24, 'PARTIDO', mLeft, mPaused)
  clock(328, 'SET', sLeft, sPaused)

  // Tiempo muerto (o el torneo, si no hay)
  if (to) {
    box(ctx, 24, 384, W - 48, 56, 14, '#3a2c0c')
    ctx.fillStyle = '#ffd27a'
    ctx.font = '600 24px ' + SANS
    ctx.textAlign = 'left'
    ctx.fillText(fitText(ctx, 'TIEMPO MUERTO · ' + (to === 'A' ? nameA : nameB), 400), 44, 412)
    ctx.textAlign = 'right'
    ctx.font = '600 32px ' + MONO
    ctx.fillStyle = toRunning ? '#ffd27a' : '#ff8a8a'
    ctx.fillText(fmt(nowSec(tick?.timeoutTime, toRunning, at)), W - 44, 412)
  } else if (notice) {
    box(ctx, 24, 384, W - 48, 56, 14, '#4a1d1d')
    ctx.fillStyle = '#ff9d9d'
    ctx.font = '700 26px ' + SANS
    ctx.textAlign = 'center'
    ctx.fillText(fitText(ctx, notice, W - 72), W / 2, 412)
  } else if (m?.tournament?.name) {
    ctx.fillStyle = '#9aa4b2'
    ctx.font = '500 22px ' + SANS
    ctx.textAlign = 'center'
    ctx.fillText(fitText(ctx, m.tournament.name, W - 48), W / 2, 412)
  }
  // Un píxel que cambia siempre: sin cambios en el canvas Safari no entrega cuadros y el video queda sin cargar (readyState 0)
  flick ^= 1
  ctx.fillStyle = flick ? '#14171c' : '#14171d'
  ctx.fillRect(0, 0, 2, 2)
}

// Canvas + video listos para pasar a PiP. Safari solo deja abrir el PiP dentro del toque del usuario y con el video
// ya cargado, así que se prepara de antemano (warmPip) y al tocar se pide el PiP de inmediato, sin esperar nada.
const hasStd = () => typeof HTMLVideoElement !== 'undefined' && typeof HTMLVideoElement.prototype.requestPictureInPicture === 'function' && !!document.pictureInPictureEnabled

function createSurface() {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  draw(ctx, { m: null, tick: null, at: Date.now() })

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.setAttribute('aria-hidden', 'true')
  // Tamaño real (aunque casi invisible): Safari de iPhone no siempre acepta pasar a PiP un video diminuto
  video.style.cssText = 'position:fixed;left:0;bottom:0;width:160px;height:116px;opacity:0.01;pointer-events:none;z-index:-1'
  const stream = canvas.captureStream(10)
  let audioCtx = null
  if (!hasStd()) {
    // Safari viejo: se le suma una pista de audio en silencio (el video sigue silenciado)
    try {
      const AC = window.AudioContext || window.webkitAudioContext
      if (AC) {
        audioCtx = new AC()
        const dest = audioCtx.createMediaStreamDestination()
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        gain.gain.value = 0
        osc.connect(gain).connect(dest)
        osc.start()
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
      }
    } catch { /* sin audio: se intenta igual */ }
  }
  video.srcObject = stream
  document.body.appendChild(video)
  // Mientras espera, redibuja para que el video reciba cuadros y cargue
  const idle = setInterval(() => draw(ctx, { m: null, tick: null, at: Date.now() }), 200)
  return { canvas, ctx, video, stream, audioCtx, idle }
}

let warm = null
// Deja preparado el video (silenciado, reproduciendo) para que el toque de "fijar" lo pase a PiP al instante
export function warmPip() {
  if (typeof document === 'undefined' || warm || docPipSupported() || !pipSupported()) return
  try {
    warm = createSurface()
    warm.video.play().catch(() => {})
  } catch { warm = null }
}

// Abre el PiP (hay que llamarlo desde un toque del usuario). getState() devuelve { m, tick, at }.
// onClose se avisa cuando se cierra la ventanita (por el usuario o por el sistema). Devuelve { stop }.
export async function startPip(getState, onClose) {
  // PC (Chrome/Edge): ventana flotante real siempre visible, como Spotify o Meet
  if (docPipSupported()) {
    try { return await startDocPip(getState, onClose) } catch { /* sigue con el PiP de video */ }
  }
  if (!pipSupported()) throw new Error('Tu navegador no permite fijar el reloj')
  const std = hasStd()
  const fresh = !warm
  const { ctx, video, stream, audioCtx, idle } = warm ?? createSurface()
  clearInterval(idle)
  warm = null
  draw(ctx, getState())

  let done = false
  let timer = 0
  const stop = () => {
    if (done) return
    done = true
    clearInterval(timer)
    try {
      if (document.pictureInPictureElement === video) document.exitPictureInPicture().catch(() => {})
      if (typeof video.webkitSetPresentationMode === 'function' && video.webkitPresentationMode === 'picture-in-picture') video.webkitSetPresentationMode('inline')
    } catch { /* ya cerrado */ }
    video.pause()
    video.srcObject = null
    video.remove()
    try { audioCtx?.close() } catch { /* ya cerrado */ }
    onClose?.()
    setTimeout(warmPip, 300) // deja listo el próximo
  }
  video.addEventListener('leavepictureinpicture', stop)
  video.addEventListener('webkitpresentationmodechanged', () => { if (video.webkitPresentationMode !== 'picture-in-picture') stop() })

  timer = setInterval(() => draw(ctx, getState()), 200)
  try {
    const playing = video.play()
    if (std) {
      // Se pide en el mismo instante del toque: después de un await Safari ya no lo considera un gesto del usuario
      try {
        await video.requestPictureInPicture()
      } catch (e) {
        if (!fresh) throw e
        await playing // video recién creado, sin metadatos todavía: se reintenta cuando ya cargó
        await video.requestPictureInPicture()
      }
    } else {
      await enterWebkitPip(video, playing)
    }
  } catch (e) {
    const info = ' [' + [e?.name, e?.message].filter(Boolean).join(': ') + ' | modo=' + video.webkitPresentationMode + ' ready=' + video.readyState + ' video=' + stream.getVideoTracks().length + ' audio=' + stream.getAudioTracks().length + (fresh ? ' sin-precarga' : '') + ']'
    stop()
    throw new Error('No se pudo fijar el reloj' + info)
  }
  return { stop }
}

// Safari de iPhone: PiP con la API propia de WebKit. Se intenta apenas se toca (dentro del gesto) y de nuevo cuando el video ya está reproduciendo.
async function enterWebkitPip(video, playing) {
  const inPip = () => video.webkitPresentationMode === 'picture-in-picture'
  let last = null
  const attempt = () => {
    try { video.webkitSetPresentationMode('picture-in-picture') } catch (e) { last = e }
  }
  attempt()
  try { await playing } catch (e) { last = e }
  if (!inPip()) attempt()
  if (!inPip()) {
    await new Promise((r) => setTimeout(r, 400))
    if (!inPip()) attempt()
  }
  await new Promise((r) => setTimeout(r, 300))
  if (!inPip()) throw last ?? new Error('Safari no abrió la ventana flotante')
}
