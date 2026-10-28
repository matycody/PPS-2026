import { useCallback, useState, useSyncExternalStore } from 'react'
import { pipSupported } from '../lib/pipClock'
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
  return {
    supported,
    canPin: supported && !!m && CAN_PIN.includes(m.status),
    active: !!m && activeId === m.id,
    error,
    toggle,
  }
}
