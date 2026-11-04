import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useTourStore } from '../stores/tourStore'

const PAD = 6 // margen del resaltado alrededor del elemento
const GAP = 12 // separación entre el elemento y el globo
const EDGE = 12 // margen mínimo con los bordes de la pantalla

// Tutorial paso a paso: resalta un elemento y muestra un globo con Anterior / Siguiente y X para saltar.
export default function TourOverlay() {
  const active = useTourStore((s) => s.active)
  const next = useTourStore((s) => s.next)
  const prev = useTourStore((s) => s.prev)
  const close = useTourStore((s) => s.close)
  const step = active ? active.steps[active.index] : null

  const [rect, setRect] = useState(null)
  const [pos, setPos] = useState(null)
  const popRef = useRef(null)

  // Mide el elemento resaltado (y lo vuelve a medir si cambia el tamaño o se hace scroll)
  useLayoutEffect(() => {
    if (!step) return undefined
    const find = () => (step.target ? document.querySelector(step.target) : null)
    const measure = () => {
      const el = find()
      if (!el) return setRect(null)
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    find()?.scrollIntoView?.({ block: 'center' })
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step])

  // Ubica el globo debajo o arriba del elemento (o centrado si el paso no tiene elemento)
  useLayoutEffect(() => {
    const p = popRef.current
    if (!step || !p) return
    const w = p.offsetWidth
    const h = p.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (!rect) return setPos({ top: Math.max(EDGE, (vh - h) / 2), left: Math.max(EDGE, (vw - w) / 2) })
    const below = rect.top + rect.height + PAD + GAP
    const above = rect.top - PAD - GAP - h
    const top = below + h <= vh - EDGE ? below : above >= EDGE ? above : Math.max(EDGE, (vh - h) / 2)
    const left = Math.min(Math.max(EDGE, rect.left + rect.width / 2 - w / 2), vw - w - EDGE)
    setPos({ top, left })
  }, [rect, step])

  // Esc cierra; flechas navegan
  useEffect(() => {
    if (!step) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, next, prev, close])

  if (!active || !step) return null
  const last = active.index === active.steps.length - 1

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={step.title}>
      {/* Bloquea los toques al resto de la pantalla mientras dura el tutorial */}
      <div className={'absolute inset-0 ' + (rect ? '' : 'bg-black/60')} />
      {rect && (
        <div
          className="pointer-events-none absolute rounded-2xl border-2 border-accent transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
          }}
        />
      )}

      <div
        ref={popRef}
        className="absolute w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-surface p-4 text-fg shadow-2xl"
        style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-base font-extrabold leading-tight">{step.title}</p>
          <button aria-label="Saltar tutorial" onClick={close} className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-surface-2">
            <X size={16} />
          </button>
        </div>
        <p className="mt-2 text-sm leading-snug text-muted">{step.text}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-muted">{active.index + 1} / {active.steps.length}</span>
          <div className="flex gap-2">
            {active.index > 0 && (
              <button onClick={prev} className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm font-bold">Anterior</button>
            )}
            <button onClick={next} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-black">{last ? 'Listo' : 'Siguiente'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
