// Reloj flotante (Picture-in-Picture) de un partido, para quien mira sin controlar.
// Se dibuja en un canvas, se convierte en video y se manda a PiP: sigue visible al salir de la app.
//  - Android / Chrome / Edge: video.requestPictureInPicture()
//  - iOS / Safari: video.webkitSetPresentationMode('picture-in-picture')
// Los relojes avanzan solos entre un tick y otro (por si el navegador demora los eventos en segundo plano).

import { fmt, nowSec } from './pipTime'
import { startDocPip, docPipSupported } from './pipDocument'

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
  const finished = m?.status === 'FINISHED'
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
  ctx.font = '600 46px ' + MONO
  ctx.fillText((m?.score?.teamA ?? 0) + ' - ' + (m?.score?.teamB ?? 0), W / 2, 133)

  // Los dos relojes
  const mPaused = tick?.isMatchPaused ?? true
  const sPaused = tick?.isSetPaused ?? true
  const dim = !!to
  const clock = (x, label, str, paused) => {
    box(ctx, x, 236, 288, 128, 16, '#1d222a')
    ctx.globalAlpha = dim ? 0.55 : 1
    ctx.fillStyle = '#9aa4b2'
    ctx.font = '600 20px ' + SANS
    ctx.textAlign = 'center'
    ctx.fillText(label + (paused ? ' · PAUSA' : ''), x + 144, 262)
    ctx.fillStyle = '#f2f4f7'
    ctx.font = '600 76px ' + MONO
    ctx.fillText(fmt(nowSec(str, !paused, at)), x + 144, 321)
    ctx.globalAlpha = 1
  }
  clock(24, 'PARTIDO', tick?.matchTime, mPaused)
  clock(328, 'SET', tick?.setTime, sPaused)

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
  } else if (m?.tournament?.name) {
    ctx.fillStyle = '#9aa4b2'
    ctx.font = '500 22px ' + SANS
    ctx.textAlign = 'center'
    ctx.fillText(fitText(ctx, m.tournament.name, W - 48), W / 2, 412)
  }
}

// Abre el PiP (hay que llamarlo desde un toque del usuario). getState() devuelve { m, tick, at }.
// onClose se avisa cuando se cierra la ventanita (por el usuario o por el sistema). Devuelve { stop }.
export async function startPip(getState, onClose) {
  // PC (Chrome/Edge): ventana flotante real siempre visible, como Spotify o Meet
  if (docPipSupported()) {
    try { return await startDocPip(getState, onClose) } catch { /* sigue con el PiP de video */ }
  }
  if (!pipSupported()) throw new Error('Tu navegador no permite fijar el reloj')
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  draw(ctx, getState())

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.setAttribute('aria-hidden', 'true')
  video.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none'
  video.srcObject = canvas.captureStream(10)
  document.body.appendChild(video)

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
    onClose?.()
  }
  video.addEventListener('leavepictureinpicture', stop)
  video.addEventListener('webkitpresentationmodechanged', () => { if (video.webkitPresentationMode !== 'picture-in-picture') stop() })

  timer = setInterval(() => draw(ctx, getState()), 200)
  try {
    await video.play()
    if (typeof video.requestPictureInPicture === 'function' && document.pictureInPictureEnabled) await video.requestPictureInPicture()
    else video.webkitSetPresentationMode('picture-in-picture')
  } catch (e) {
    stop()
    throw new Error('No se pudo fijar el reloj en este dispositivo')
  }
  return { stop }
}
