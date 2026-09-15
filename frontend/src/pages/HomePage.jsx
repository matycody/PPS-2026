import { useEffect } from 'react'
import { useTimerStore } from '../stores/timerStore'
import { useThemeStore } from '../stores/themeStore'
import { Timer } from '../features/timer/Timer'
import { TimerControls } from '../features/timer/TimerControls'
import { GlobalToggles } from '../features/timer/GlobalToggles'
import { ThemeToggle } from '../components/ThemeToggle'

// TODO: reemplazar por selector real de cancha cuando haya multi-cancha en la UI
const TEST_MATCH_ID = 'cancha-1'

export function HomePage() {
  const setMatchId = useTimerStore((state) => state.setMatchId)
  const initTheme = useThemeStore((state) => state.initTheme)

  useEffect(() => {
    setMatchId(TEST_MATCH_ID)
    initTheme()
  }, [setMatchId, initTheme])

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col items-center px-5 py-8 gap-5">
      <div className="flex items-center justify-between w-full max-w-md">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-extrabold uppercase text-[var(--color-accent-blue)]">
            🎯 Championship Chrono
          </span>
          <h1 className="text-[22px] font-extrabold text-[var(--color-text-primary)]">
            Cronómetro Dodgeball
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="bg-[var(--color-surface)] text-[var(--color-accent-green)] text-[10px] font-bold px-2 py-1 rounded-lg">
            LIVE
          </span>
          <ThemeToggle />
        </div>
      </div>

      <div className="w-full max-w-md flex flex-col gap-5">
        <GlobalToggles />
        <Timer />
        <TimerControls />
      </div>
    </div>
  )
}