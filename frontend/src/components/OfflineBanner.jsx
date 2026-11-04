import { useEffect, useRef, useState } from 'react'
import { WifiOff, Wifi } from 'lucide-react'
import { clearApiCache } from '../lib/api'

// Barra fija arriba: avisa cuando el dispositivo se queda sin internet y confirma cuando vuelve (y desaparece sola)
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  const [back, setBack] = useState(false) // "Conexión recuperada", se muestra unos segundos
  const timer = useRef(null)

  useEffect(() => {
    const goOffline = () => { clearTimeout(timer.current); setBack(false); setOnline(false) }
    const goOnline = () => {
      setOnline(true)
      setBack(true)
      clearApiCache() // los datos pedidos sin red no deben quedar en caché
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setBack(false), 3000)
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      clearTimeout(timer.current)
    }
  }, [])

  if (online && !back) return null
  const ok = online
  return (
    <div
      role="status"
      aria-live="polite"
      style={{ background: ok ? '#22c55e' : '#f59e0b', color: '#0b1220', textShadow: 'none', opacity: 1 }} // colores sólidos: sin transparencia ni halo del tema
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-center text-sm font-bold"
    >
      {ok ? <Wifi size={16} /> : <WifiOff size={16} />}
      {ok ? 'Conexión recuperada' : 'Sin conexión: datos desactualizados'}
    </div>
  )
}
