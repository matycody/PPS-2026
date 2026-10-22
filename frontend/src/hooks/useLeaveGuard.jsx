import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Avisa antes de salir de una pantalla donde la persona está operando algo (ej. un partido como árbitro o mesa).
// Intercepta los enlaces internos (menú, barra inferior, banners), el cierre o recarga de la pestaña,
// y expone ask(accion) para botones que navegan por código (ej. "Volver").
// Devuelve { modal, ask }: hay que renderizar `modal` en la pantalla.
export function useLeaveGuard(active, role) {
  const navigate = useNavigate()
  const [pending, setPending] = useState(null) // { to } | { run }
  const activeRef = useRef(active)
  activeRef.current = active

  useEffect(() => {
    if (!active) return undefined
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
    document.addEventListener('click', onClick, true) // en captura: antes de que el enlace navegue
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [active])

  const ask = useCallback((run) => {
    if (activeRef.current) setPending({ run })
    else run()
  }, [])

  const leave = () => {
    const p = pending
    setPending(null)
    if (p?.run) p.run()
    else if (p?.to) navigate(p.to)
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
