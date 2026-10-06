import { useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { play, unlockAudio, isMuted, setMuted } from '../lib/sound'

export default function SoundToggle() {
  const [muted, setMutedState] = useState(isMuted())
  const toggle = () => {
    unlockAudio()
    const next = !muted
    setMuted(next)
    setMutedState(next)
    if (!next) play('test')
  }
  return (
    <button onClick={toggle} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm font-extrabold">
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />} {muted ? 'Sonido silenciado (tocar para activar)' : 'Sonido activado (tocar para silenciar)'}
    </button>
  )
}