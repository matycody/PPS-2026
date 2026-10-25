import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Avisa antes de salir de una pantalla donde la persona está operando algo (ej. un partido como árbitro o mesa).
// Cubre: enlaces internos (menú, barra inferior, banners), cerrar o recargar la pestaña, el botón o gesto
// "atrás" del celular/navegador y los botones que vuelven por código (ask({ back: true })).
// Devuelve { modal, ask }: hay que renderizar `modal` en la pantalla.
//
// "Atrás": al activarse se agrega una entrada igual a la actual al historial (marcada). Si la persona
// aprieta "atrás" cae en la entrada original (misma pantalla): se vuelve a agregar la marca y se pregunta.
const MARK = '__leaveGuard'
const hasMark = () => !!window.history.state?.[MARK]
const addMark = () => window.history.pushState({ ...(window.history.state ?? {}), [MARK]: 1 }, '', window.location.href)

export function useLeaveGuard(active, role) {
  const navigate = useNavigate()
  const [pending, setPending] = useState(null) // { to } | { back: true } | { run }
  const activeRef = useRef(active)
  const skipRef = useRef(false) // ignora el popstate que provocamos nosotros al salir
  activeRef.current = active

  useEffect(() => {
    if (!active) return undefined
    if (!hasMark()) addMark()

    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target?.closest?.('a[href]')
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname + url.search === window.location.pathname + window.location.search) return
      e.preventDefault()
      e.stopPropagation()
      setPending({ to: url.pathname + url.search + url.hash })
    }
    const onUnload = (e) => { e.preventDefault(); e.returnValue = '' }
    const onPop = () => {
      if (skipRef.current) { skipRef.current = false; return }
      if (hasMark()) return // "adelante" hacia la entrada marcada: nada que avisar
      addMark() // se queda en la pantalla, lista para el próximo "atrás"
      setPending({ back: true })
    }
    document.addEventListener('click', onClick, true) // en captura: antes de que el enlace navegue
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('popstate', onPop)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('popstate', onPop)
    }
  }, [active])

  const ask = useCallback((arg) => {
    if (activeRef.current) setPending(arg)
    else if (typeof arg === 'function') arg()
    else if (arg?.back) navigate(-1)
  }, [navigate])

  const skipNext = () => { skipRef.current = true; setTimeout(() => { skipRef.current = false }, 800) }

  const leave = () => {
    const p = pending
    setPending(null)
    if (!p) return
    if (typeof p === 'function') return p()
    const marked = hasMark()
    if (p.back) {
      // desde la entrada marcada hay que retroceder dos: la marca y la pantalla
      if (marked) { skipNext(); window.history.go(-2) } else navigate(-1)
      return
    }
    if (marked) {
      // primero se quita la marca (volver a la entrada original) y recién ahí se va al destino
      const go = () => { window.removeEventListener('popstate', go); navigate(p.to) }
      skipNext()
      window.addEventListener('popstate', go)
      window.history.back()
    } else navigate(p.to)
  }

  const modal = pending && (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="leave-title">
      <div className="w-full max-w-sm space-y-4 rounded-3xl border border-line bg-surface p-5 text-center shadow-2xl">
        <p id="leave-title" className="text-lg font-extrabold">¿Salir del partido?</p>
        <p className="text-sm text-muted">
          ¿Estás seguro de que querés salir de un partido en el cual estás siendo {role}?
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setPending(null)} className="rounded-2xl bg-accent py-3 font-extrabold text-black">Quedarme</button>
          <button onClick={leave} className="rounded-2xl border border-danger py-3 font-extrabold text-danger">Salir</button>
        </div>
      </div>
    </div>
  )

  return { modal, ask }
}
