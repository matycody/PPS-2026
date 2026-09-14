import { useEffect } from 'react'
import { useTimerStore } from '../stores/timerStore'
import { Timer } from '../features/timer/Timer'
import { TimerControls } from '../features/timer/TimerControls'

// TODO: reemplazar por un matchId real que Matías cree en el backend para pruebas
const TEST_MATCH_ID = 'cancha-1'

export function HomePage() {
  const setMatchId = useTimerStore((state) => state.setMatchId)

  useEffect(() => {
    setMatchId(TEST_MATCH_ID)
  }, [setMatchId])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold">Cronómetro Dodgeball</h1>
      <Timer />
      <TimerControls />
    </div>
  )
}