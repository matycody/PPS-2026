import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { pipSupported, warmPip } from '../lib/pipClock'
import { pipActiveId, subscribePip, togglePip } from '../lib/pipManager'

const CAN_PIN = ['LIVE', 'READY', 'SCHEDULED']
const supported = pipSupported()

// Fijar el reloj del partido m en una ventanita flotante (para quien mira, no para quien controla)
export function usePipClock(m) {
  const activeId = useSyncExternalStore(subscribePip, pipActiveId)
  const [error, setError] = useState('')
  const toggle = useCallback(async () => {
    setError('')
    try { await togglePip(m) } catch (e) { setError(e.message) }
  }, [m])
  // El reloj fijado no se saca solo: si el partido terminó, la chincheta sigue para poder quitarlo
  const canPin = supported && !!m && (CAN_PIN.includes(m.status) || activeId === m.id)
  useEffect(() => { if (canPin) warmPip() }, [canPin])
  return {
    supported,
    canPin,
    active: !!m && activeId === m.id,
    error,
    toggle,
  }
}
