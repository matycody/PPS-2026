import { useState } from 'react'
import { useTimerStore } from '../../stores/timerStore'

function digitsToSeconds(digits) {
  const padded = digits.padStart(4, '0')
  const minutes = parseInt(padded.slice(0, 2), 10)
  const seconds = parseInt(padded.slice(2, 4), 10)
  return minutes * 60 + seconds
}

function TimerRow({ label, labelColorVar, isPaused, onPause, onResume, onReset, onApply, digits, onDigitsChange }) {
  return (
    <div className="flex flex-col gap-2 w-full">
      <span className="text-[11px] font-bold uppercase" style={{ color: `var(${labelColorVar})` }}>
        {label}
      </span>
      <div className="flex gap-2 w-full">
        {isPaused ? (
          <button onClick={onResume} className="flex-1 bg-[var(--color-accent-green)] text-[#08090c] text-xs font-bold uppercase rounded-full py-3">
            Iniciar
          </button>
        ) : (
          <button onClick={onPause} className="flex-1 bg-[var(--color-accent-green)] text-[#08090c] text-xs font-bold uppercase rounded-full py-3">
            Pausar
          </button>
        )}
        <button onClick={onReset} className="flex-1 bg-[var(--color-accent-red)] text-[#08090c] text-xs font-bold uppercase rounded-full py-3">
          Reset
        </button>
        <input
          type="text"
          inputMode="numeric"
          placeholder="mmss"
          value={digits}
          onChange={onDigitsChange}
          className="flex-1 bg-transparent border border-[var(--color-border)] text-[var(--color-text-primary)] text-xs font-bold uppercase rounded-full py-3 text-center"
        />
        <button onClick={onApply} className="flex-1 border border-[var(--color-border)] text-[var(--color-text-primary)] text-xs font-bold uppercase rounded-full py-3">
          Set
        </button>
      </div>
    </div>
  )
}

export function TimerControls() {
  const startTimer = useTimerStore((state) => state.startTimer)
  const pauseTimer = useTimerStore((state) => state.pauseTimer)
  const resumeTimer = useTimerStore((state) => state.resumeTimer)
  const pauseBoth = useTimerStore((state) => state.pauseBoth)
  const resetTimer = useTimerStore((state) => state.resetTimer)
  const setTimerValue = useTimerStore((state) => state.setTimerValue)
  const finishHalf = useTimerStore((state) => state.finishHalf)
  const isMatchPaused = useTimerStore((state) => state.isMatchPaused)
  const isSetPaused = useTimerStore((state) => state.isSetPaused)
  const modality = useTimerStore((state) => state.modality)
  const matchTime = useTimerStore((state) => state.matchTime)
  const currentHalf = useTimerStore((state) => state.currentHalf)

  const [matchDigits, setMatchDigits] = useState('')
  const [setDigits, setSetDigits] = useState('')

  const applyMatchTime = () => {
    if (!matchDigits) return
    setTimerValue('match', digitsToSeconds(matchDigits))
    setMatchDigits('')
  }

  const applySetTime = () => {
    if (!setDigits) return
    setTimerValue('set', digitsToSeconds(setDigits))
    setSetDigits('')
  }

  // Igual que en Timer.jsx: el backend no marca isMatchPaused solo al llegar a 0:00,
  // así que el botón lo trata como pausado igual para que coincida visualmente.
  const matchLooksPaused = isMatchPaused || matchTime === '0:00'

  const showFinishButton = modality === 'cloth' || matchTime === '0:00'

  return (
    <div className="flex flex-col gap-5 w-full">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-4 flex flex-col gap-4 w-full">
        <TimerRow
          label="Control de Partido"
          labelColorVar="--color-accent-blue"
          isPaused={matchLooksPaused}
          onPause={() => pauseTimer('match')}
          onResume={() => resumeTimer('match')}
          onReset={() => resetTimer('match')}
          onApply={applyMatchTime}
          digits={matchDigits}
          onDigitsChange={(e) => setMatchDigits(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />
        <div className="h-px bg-[var(--color-border)] w-full" />
        <TimerRow
          label="Control de Set"
          labelColorVar="--color-accent-green"
          isPaused={isSetPaused}
          onPause={() => pauseTimer('set')}
          onResume={() => resumeTimer('set')}
          onReset={() => resetTimer('set')}
          onApply={applySetTime}
          digits={setDigits}
          onDigitsChange={(e) => setSetDigits(e.target.value.replace(/\D/g, '').slice(0, 4))}
        />
      </div>

      <div className="flex gap-3 w-full">
        <button
          onClick={() => startTimer('both')}
          className="flex-1 bg-[var(--color-accent-green)] text-[#08090c] text-sm font-extrabold uppercase rounded-full py-4"
        >
          ▶ Iniciar ambos
        </button>
        <button
          onClick={pauseBoth}
          className="flex-1 bg-[var(--color-accent-red)] text-[#08090c] text-sm font-extrabold uppercase rounded-full py-4"
        >
          ⏸ Pausar ambos
        </button>
      </div>

      {showFinishButton && (
        <button
          onClick={finishHalf}
          className="w-full bg-[var(--color-accent-red)] text-[#08090c] text-sm font-extrabold uppercase rounded-full py-4"
        >
          {currentHalf === 2 ? 'Finalizar Partido' : 'Finalizar Tiempo'}
        </button>
      )}
    </div>
  )
}