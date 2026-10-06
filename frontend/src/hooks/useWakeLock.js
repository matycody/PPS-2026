import { useEffect } from 'react'

// Mantiene la pantalla encendida mientras `active` sea true (Wake Lock API)
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let sentinel = null
    let cancelled = false

    const request = async () => {
      try {
        const s = await navigator.wakeLock.request('screen')
        if (cancelled) { s.release().catch(() => {}); return }
        sentinel = s
      } catch (e) {
        console.warn('[wakeLock]', e.message)
      }
    }
    // El navegador lo libera al pasar a segundo plano: se vuelve a pedir al volver
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) request()
    }

    request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release().catch(() => {})
    }
  }, [active])
}