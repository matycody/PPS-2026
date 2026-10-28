import { useCallback, useEffect, useRef, useState } from 'react'
import { pipSupported, startPip } from '../lib/pipClock'

// Fijar el reloj del partido en una ventanita flotante (para espectadores)
export function usePipClock(m, tick) {
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')
  const state = useRef({ m, tick, at: Date.now() })
  const ctl = useRef(null)
  state.current.m = m
  state.current.tick = tick
  useEffect(() => { state.current.at = Date.now() }, [tick])

  const stop = useCallback(() => { ctl.current?.stop(); ctl.current = null }, [])
  const toggle = useCallback(async () => {
    setError('')
    if (ctl.current) return stop()
    try {
      setActive(true)
      ctl.current = await startPip(() => state.current, () => { ctl.current = null; setActive(false) })
    } catch (e) {
      setActive(false)
      setError(e.message)
    }
  }, [stop])

  useEffect(() => stop, [stop])
  return { supported: pipSupported(), active, error, toggle }
}
