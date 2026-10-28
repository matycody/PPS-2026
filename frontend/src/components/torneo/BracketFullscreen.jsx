import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { Minus, Plus, Maximize, X } from 'lucide-react'

const MIN = 0.2
const MAX = 2
const STEP = 0.15
const PAD = 16
const clamp = (n) => Math.min(MAX, Math.max(MIN, n))

// Vista a pantalla completa del cuadro: se ajusta al ancho disponible, con zoom (botones, pellizco, Ctrl + rueda)
// y desplazamiento arrastrando. Recibe el cuadro como hijo y lo dibuja escalado con transform.
export default function BracketFullscreen({ onClose, title = 'Playoffs', children }) {
  const scrollerRef = useRef(null)
  const innerRef = useRef(null)
  const boxRef = useRef(null)
  const natRef = useRef({ w: 0, h: 0 })
  const scaleRef = useRef(1)
  const modeRef = useRef('fit')
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const pointers = useRef(new Map())
  const gesture = useRef({ lastDist: 0, moved: 0, lastTap: 0 })
  const [scale, setScaleState] = useState(1)
  const [nat, setNat] = useState({ w: 0, h: 0 })

  // sync: aplica ya al DOM (gestos); sin sync se usa dentro de efectos, donde flushSync no corresponde
  const setScale = useCallback((s, sync = true) => {
    scaleRef.current = s
    if (sync) flushSync(() => setScaleState(s))
    else setScaleState(s)
  }, [])

  // Cabe entero en el área visible (sin scroll horizontal ni vertical)
  const fit = useCallback((sync = true) => {
    const sc = scrollerRef.current
    const { w, h } = natRef.current
    if (!sc || !w || !h) return
    modeRef.current = 'fit'
    setScale(clamp(Math.min((sc.clientWidth - PAD * 2) / w, (sc.clientHeight - PAD * 2) / h)), sync)
    sc.scrollLeft = 0
    sc.scrollTop = 0
  }, [setScale])

  // Cambia el zoom manteniendo fijo el punto (cx, cy) de la pantalla; sin punto, el centro del área visible
  const zoomTo = useCallback((next, cx, cy) => {
    const sc = scrollerRef.current
    const box = boxRef.current
    if (!sc || !box) return
    const s2 = clamp(next)
    const s1 = scaleRef.current
    if (s2 === s1) return
    const r = sc.getBoundingClientRect()
    const px = cx ?? r.left + r.width / 2
    const py = cy ?? r.top + r.height / 2
    const b1 = box.getBoundingClientRect()
    const ux = (px - b1.left) / s1
    const uy = (py - b1.top) / s1
    modeRef.current = 'free'
    setScale(s2)
    const b2 = box.getBoundingClientRect()
    sc.scrollLeft += b2.left + ux * s2 - px
    sc.scrollTop += b2.top + uy * s2 - py
  }, [setScale])

  // Mide el cuadro sin escala (offsetWidth/Height no cambian con transform)
  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return undefined
    const measure = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w === natRef.current.w && h === natRef.current.h) return
      natRef.current = { w, h }
      setNat({ w, h })
      if (modeRef.current === 'fit') fit(false)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fit])

  // Reajusta al cambiar la ventana o girar el celular
  useEffect(() => {
    const onResize = () => { if (modeRef.current === 'fit') fit(false) }
    const sc = scrollerRef.current
    const ro = new ResizeObserver(onResize)
    if (sc) ro.observe(sc)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [fit])

  // Esc cierra; el scroll de la página queda bloqueado mientras está abierto
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current() }
    window.addEventListener('keydown', onKey)
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [])

  // Ctrl + rueda: zoom (listener nativo no pasivo para poder frenar el zoom del navegador)
  useEffect(() => {
    const sc = scrollerRef.current
    if (!sc) return undefined
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      zoomTo(scaleRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY)
    }
    sc.addEventListener('wheel', onWheel, { passive: false })
    return () => sc.removeEventListener('wheel', onWheel)
  }, [zoomTo])

  // Gestos: un puntero mueve, dos hacen pellizco, doble toque alterna Ajustar / 100 %
  useEffect(() => {
    const sc = scrollerRef.current
    if (!sc) return undefined
    const pts = pointers.current
    const g = gesture.current
    const two = () => {
      const [a, b] = [...pts.values()]
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }

    const onDown = (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 1) g.moved = 0
      if (pts.size === 2) g.lastDist = two().dist
    }
    const onMove = (e) => {
      const p = pts.get(e.pointerId)
      if (!p) return
      if (pts.size === 1) {
        const dx = e.clientX - p.x
        const dy = e.clientY - p.y
        g.moved += Math.abs(dx) + Math.abs(dy)
        sc.scrollLeft -= dx
        sc.scrollTop -= dy
        p.x = e.clientX
        p.y = e.clientY
      } else if (pts.size === 2) {
        p.x = e.clientX
        p.y = e.clientY
        const t = two()
        g.moved += 10
        if (g.lastDist > 0) zoomTo(scaleRef.current * (t.dist / g.lastDist), t.x, t.y)
        g.lastDist = t.dist
      }
    }
    const onUp = (e) => {
      if (!pts.has(e.pointerId)) return
      const wasSingle = pts.size === 1
      pts.delete(e.pointerId)
      g.lastDist = 0
      if (wasSingle && e.type === 'pointerup' && e.pointerType === 'touch' && g.moved < 8) {
        const now = Date.now()
        if (now - g.lastTap < 300) {
          g.lastTap = 0
          if (modeRef.current === 'fit') zoomTo(1)
          else fit()
        } else g.lastTap = now
      }
    }

    sc.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      sc.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [zoomTo, fit])

  // Tras arrastrar o pellizcar no se abre el partido que quedó debajo del dedo
  const swallowClick = (e) => {
    if (gesture.current.moved >= 8) {
      e.preventDefault()
      e.stopPropagation()
      gesture.current.moved = 0
    }
  }

  const btn = 'flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-bold disabled:opacity-40'

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[100] flex flex-col bg-bg"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <button type="button" onClick={onClose} className={btn} aria-label="Cerrar"><X size={20} /> Cerrar</button>
        <p className="min-w-0 flex-1 truncate text-sm font-extrabold">{title}</p>
        <button type="button" className={btn} aria-label="Alejar" disabled={scale <= MIN} onClick={() => zoomTo(scaleRef.current - STEP)}><Minus size={18} /></button>
        <span className="w-12 text-center font-mono text-sm tabular-nums">{Math.round(scale * 100)}%</span>
        <button type="button" className={btn} aria-label="Acercar" disabled={scale >= MAX} onClick={() => zoomTo(scaleRef.current + STEP)}><Plus size={18} /></button>
        <button type="button" className={btn} onClick={() => fit()}><Maximize size={18} /> Ajustar</button>
      </div>
      <div
        ref={scrollerRef}
        onClickCapture={swallowClick}
        className="flex min-h-0 flex-1 cursor-grab overflow-auto select-none active:cursor-grabbing"
        style={{ touchAction: 'none', overscrollBehavior: 'contain', padding: PAD }}
      >
        <div
          ref={boxRef}
          className="relative m-auto shrink-0"
          style={{ width: nat.w * scale, height: nat.h * scale }}
        >
          <div
            ref={innerRef}
            className="absolute"
            style={{ left: 0, top: 0, width: 'max-content', transform: 'scale(' + scale + ')', transformOrigin: '0 0' }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
