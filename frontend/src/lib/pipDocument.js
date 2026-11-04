// Reloj flotante para PC (Chrome / Edge): Document Picture-in-Picture, una ventanita real que queda siempre
// encima de las demás aplicaciones, como la de Spotify o la de Meet. Se arma con HTML (texto nítido, escudos como imagen).
import { fmt, nowSec, pipNotice, halfLabel } from './pipTime'

const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export const docPipSupported = () => typeof window !== 'undefined' && 'documentPictureInPicture' in window

function el(doc, tag, css, text, parent) {
  const n = doc.createElement(tag)
  if (css) n.style.cssText = css
  if (text != null) n.textContent = text
  if (parent) parent.appendChild(n)
  return n
}

// Escudo circular: imagen si hay logo y carga; si no, la inicial
function crest(doc, parent) {
  const root = el(doc, 'div', 'position:relative;width:52px;height:52px;border-radius:50%;box-sizing:border-box;border:3px solid #8a93a3;background:#222831;overflow:hidden;display:grid;place-items:center;font-weight:600;font-size:22px;color:#e6eaf0', null, parent)
  const initial = el(doc, 'span', '', '?', root)
  const img = el(doc, 'img', 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none', null, root)
  img.alt = ''
  let src = ''
  img.onload = () => { img.style.display = 'block'; initial.style.visibility = 'hidden' }
  img.onerror = () => { img.style.display = 'none'; initial.style.visibility = 'visible' }
  return {
    root,
    set(team, color, halo) {
      const name = (team?.name ?? '?').charAt(0).toUpperCase()
      if (initial.textContent !== name) initial.textContent = name
      root.style.borderColor = color
      root.style.boxShadow = halo ? '0 0 0 4px #3a2c0c' : 'none'
      const url = team?.logo || ''
      if (url !== src) {
        src = url
        img.style.display = 'none'
        initial.style.visibility = 'visible'
        if (url) img.src = url
        else img.removeAttribute('src')
      }
    },
  }
}

export async function startDocPip(getState, onClose) {
  const win = await window.documentPictureInPicture.requestWindow({ width: 360, height: 330 })
  const doc = win.document
  doc.title = 'Partido'
  doc.body.style.cssText = 'margin:0;background:#14171c;color:#f2f4f7;font-family:' + SANS + ';overflow:hidden'
  const root = el(doc, 'div', 'box-sizing:border-box;height:100vh;padding:12px 14px;display:flex;flex-direction:column;gap:8px', null, doc.body)

  // Modalidad y estado
  const top = el(doc, 'div', 'display:flex;justify-content:space-between;align-items:center', null, root)
  const pill = el(doc, 'span', 'font-size:12px;font-weight:600;letter-spacing:.06em;padding:3px 10px;border-radius:999px', '', top)
  const live = el(doc, 'span', 'font-size:12px;font-weight:600;display:flex;align-items:center;gap:5px', null, top)
  const dot = el(doc, 'span', 'width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block', null, live)
  const liveTxt = el(doc, 'span', '', 'EN VIVO', live)
  const half = el(doc, 'span', 'font-size:12px;font-weight:600;letter-spacing:.06em;color:#9aa4b2', '', top)
  top.insertBefore(half, live)

  // Equipos y marcador
  const teams = el(doc, 'div', 'display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:6px', null, root)
  const side = () => {
    const c = el(doc, 'div', 'display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0', null, teams)
    const cr = crest(doc, c)
    const nm = el(doc, 'span', 'font-size:14px;font-weight:600;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center', '', c)
    return { cr, nm }
  }
  const A = side()
  const score = el(doc, 'span', 'font-family:' + MONO + ';font-size:26px;font-weight:600;background:#222831;border-radius:10px;padding:2px 12px;white-space:nowrap', '0 - 0', teams)
  const B = side()

  // Los dos relojes
  const clocks = el(doc, 'div', 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px', null, root)
  const clockBox = () => {
    const b = el(doc, 'div', 'background:#1d222a;border-radius:12px;padding:6px 8px;text-align:center', null, clocks)
    const label = el(doc, 'div', 'font-size:11px;font-weight:600;letter-spacing:.08em;color:#9aa4b2', '', b)
    const time = el(doc, 'div', 'font-family:' + MONO + ';font-size:36px;font-weight:600;line-height:1.15;font-variant-numeric:tabular-nums', '--:--', b)
    return { b, label, time }
  }
  const MC = clockBox()
  const SC = clockBox()

  // Tiempo muerto, o el torneo si no hay
  const foot = el(doc, 'div', 'border-radius:12px;padding:7px 10px;display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:600;min-height:20px', null, root)
  const footL = el(doc, 'span', 'min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis', '', foot)
  const footR = el(doc, 'span', 'font-family:' + MONO + ';font-size:18px;margin-left:8px', '', foot)

  const update = () => {
    const { m, tick, at } = getState()
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
    const nameA = m?.teamA?.name ?? 'Equipo A'
    const nameB = m?.teamB?.name ?? 'Equipo B'

    pill.textContent = cloth ? 'CLOTH' : 'FOAM'
    pill.style.background = cloth ? '#3b2a5c' : '#1f3a5f'
    pill.style.color = cloth ? '#cdb6ff' : '#9cc8ff'
    liveTxt.textContent = finished ? 'FINALIZADO' : 'EN VIVO'
    live.style.color = finished ? '#9aa4b2' : '#ff6b6b'
    dot.style.display = finished ? 'none' : 'inline-block'

    A.cr.set(m?.teamA, '#4f86e8', to === 'A')
    B.cr.set(m?.teamB, '#8a93a3', to === 'B')
    A.nm.textContent = nameA
    B.nm.textContent = nameB
    score.textContent = (m?.score?.teamA ?? 0) + ' - ' + (m?.score?.teamB ?? 0)

    half.textContent = finished ? '' : halfLabel(tick)
    MC.label.textContent = 'PARTIDO' + (finished ? ' · FINALIZADO' : mPaused ? ' · PAUSA' : '')
    SC.label.textContent = 'SET' + (finished ? ' · FINALIZADO' : sPaused ? ' · PAUSA' : '')
    MC.time.textContent = fmt(mLeft)
    SC.time.textContent = fmt(sLeft)
    MC.b.style.opacity = SC.b.style.opacity = to ? '0.55' : '1'

    if (to) {
      foot.style.background = '#3a2c0c'
      foot.style.color = to && !toRunning ? '#ff8a8a' : '#ffd27a'
      footL.textContent = 'Tiempo muerto · ' + (to === 'A' ? nameA : nameB)
      footR.textContent = fmt(nowSec(tick?.timeoutTime, toRunning, at))
    } else if (notice) {
      foot.style.background = '#4a1d1d'
      foot.style.color = '#ff9d9d'
      footL.textContent = notice
      footR.textContent = ''
    } else {
      foot.style.background = 'transparent'
      foot.style.color = '#9aa4b2'
      footL.textContent = m?.tournament?.name ?? ''
      footR.textContent = ''
    }
  }

  update()
  const timer = setInterval(update, 250)
  let done = false
  const stop = () => {
    if (done) return
    done = true
    clearInterval(timer)
    win.removeEventListener('pagehide', stop)
    try { win.close() } catch { /* ya cerrada */ }
    onClose?.()
  }
  win.addEventListener('pagehide', stop)
  return { stop }
}
