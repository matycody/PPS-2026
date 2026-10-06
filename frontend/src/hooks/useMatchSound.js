import { useEffect } from 'react'
import { socket } from '../sockets/socket'
import { play, unlockAudio, setDefaultMuted, setSoundAllowed } from '../lib/sound'

// Solo mesa y arbitros pueden tener sonido. allowed=false => siempre silenciado.
// Suena segun los eventos del servidor, asi todos los dispositivos coinciden.
export function useMatchSound(matchId, allowed) {
  useEffect(() => {
    setSoundAllowed(!!allowed)
    if (!allowed) return undefined
    setDefaultMuted(false)
    const onSet = (p) => p.matchId === matchId && play(p.source === 'match' ? 'match' : 'set')
    const onTimeout = (p) => p.matchId === matchId && play('timeout')
    socket.on('match:setExpired', onSet)
    socket.on('match:timeoutExpired', onTimeout)
    window.addEventListener('pointerdown', unlockAudio, { once: true })
    return () => {
      socket.off('match:setExpired', onSet)
      socket.off('match:timeoutExpired', onTimeout)
      window.removeEventListener('pointerdown', unlockAudio)
      setSoundAllowed(false)
    }
  }, [matchId, allowed])
}
