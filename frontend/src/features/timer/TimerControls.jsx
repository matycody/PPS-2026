import { useState } from 'react'
import { useTimerStore } from '../../stores/timerStore'

function digitsToSeconds(digits) {
  const padded = digits.padStart(4, '0')
  const minutes = parseInt(padded.slice(0, 2), 10)
  const seconds = parseInt(padded.slice(2, 4), 10)
  return minutes * 60 + seconds
}

function formatDigitsPreview(digits) {
  const padded = digits.padStart(4, '0')
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`
}

export function TimerControls() {
  const startTimer = useTimerStore((state) => state.startTimer)
  const pauseTimer = useTimerStore((state) => state.pauseTimer)
  const resumeTimer = useTimerStore((state) => state.resumeTimer)
  const pauseBoth = useTimerStore((state) => state.pauseBoth)
  const resetTimer = useTimerStore((state) => state.resetTimer)
  const setTimerValue = useTimerStore((state) => state.setTimerValue)
  const setModality = useTimerStore((state) => state.setModality)
  const setHalf = useTimerStore((state) => state.setHalf)
  const finishHalf = useTimerStore((state) => state.finishHalf)
  const isMatchPaused = useTimerStore((state) => state.isMatchPaused)
  const isSetPaused = useTimerStore((state) => state.isSetPaused)
  const modality = useTimerStore((state) => state.modality)
  const matchTime = useTimerStore((state) => state.matchTime)
  const currentHalf = useTimerStore((state) => state.currentHalf)

  const [matchDigits, setMatchDigits] = useState('')
  const [setDigits, setSetDigits] = useState('')

  const handleMatchChange = (e) => {
    setMatchDigits(e.target.value.replace(/\D/g, '').slice(0, 4))
  }

  const handleSetChange = (e) => {
    setSetDigits(e.target.value.replace(/\D/g, '').slice(0, 4))
  }

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

  const showFinishButton = matchTime === '0:00'

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-2">
        <span className="text-xs text-gray-400">Partido</span>
        <div className="flex gap-2 items-center">
          {isMatchPaused ? (
            <button onClick={() => resumeTimer('match')} className="px-3 py-1 rounded bg-blue-600 text-white text-sm font-semibold">
              Iniciar
            </button>
          ) : (
            <button onClick={() => pauseTimer('match')} className="px-3 py-1 rounded bg-yellow-600 text-white text-sm font-semibold">
              Pausar
            </button>
          )}
          <button onClick={() => resetTimer('match')} className="px-3 py-1 rounded bg-gray-600 text-white text-sm">
            Reset
          </button>
          <input
            type="text"
            inputMode="numeric"
            placeholder="mmss"
            value={matchDigits}
            onChange={handleMatchChange}
            className="w-14 text-center border rounded text-sm"
          />
          {matchDigits.length > 0 && (
            <span className="text-xs text-gray-400">{formatDigitsPreview(matchDigits)}</span>
          )}
          <button onClick={applyMatchTime} className="px-2 py-1 rounded bg-gray-300 text-sm font-semibold">
            Set
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <span className="text-xs text-gray-400">Set</span>
        <div className="flex gap-2 items-center">
          {isSetPaused ? (
            <button onClick={() => resumeTimer('set')} className="px-3 py-1 rounded bg-blue-600 text-white text-sm font-semibold">
              Iniciar
            </button>
          ) : (
            <button onClick={() => pauseTimer('set')} className="px-3 py-1 rounded bg-yellow-600 text-white text-sm font-semibold">
              Pausar
            </button>
          )}
          <button onClick={() => resetTimer('set')} className="px-3 py-1 rounded bg-gray-600 text-white text-sm">
            Reset
          </button>
          <input
            type="text"
            inputMode="numeric"
            placeholder="mmss"
            value={setDigits}
            onChange={handleSetChange}
            className="w-14 text-center border rounded text-sm"
          />
          {setDigits.length > 0 && (
            <span className="text-xs text-gray-400">{formatDigitsPreview(setDigits)}</span>
          )}
          <button onClick={applySetTime} className="px-2 py-1 rounded bg-gray-300 text-sm font-semibold">
            Set
          </button>
        </div>
      </div>

      <div className="flex gap-3 justify-center">
        <button onClick={() => startTimer('both')} className="px-4 py-2 rounded bg-green-600 text-white font-semibold">
          Iniciar ambos
        </button>
        <button onClick={pauseBoth} className="px-4 py-2 rounded bg-orange-700 text-white font-semibold">
          Pausar ambos
        </button>
      </div>

      <div className="flex gap-2 items-center">
        <span className="text-sm text-gray-400">Tiempo:</span>
        <button
          onClick={() => setHalf(1)}
          className={`px-3 py-1 rounded text-sm font-semibold ${currentHalf === 1 ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          1er Tiempo
        </button>
        <button
          onClick={() => setHalf(2)}
          className={`px-3 py-1 rounded text-sm font-semibold ${currentHalf === 2 ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          2do Tiempo
        </button>
      </div>

      {showFinishButton && (
        <button onClick={finishHalf} className="px-4 py-2 rounded bg-red-700 text-white font-semibold">
          Finalizar Tiempo
        </button>
      )}

      <div className="flex gap-2 items-center">
        <span className="text-sm text-gray-400">Modalidad:</span>
        <button
          onClick={() => setModality('foam')}
          className={`px-3 py-1 rounded text-sm font-semibold ${modality === 'foam' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          Foam
        </button>
        <button
          onClick={() => setModality('cloth')}
          className={`px-3 py-1 rounded text-sm font-semibold ${modality === 'cloth' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          Cloth
        </button>
      </div>
    </div>
  )
}