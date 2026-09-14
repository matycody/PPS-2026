import { useTimerStore } from '../../stores/timerStore'

export function Timer() {
  const matchTime = useTimerStore((state) => state.matchTime)
  const setTime = useTimerStore((state) => state.setTime)
  const isMatchPaused = useTimerStore((state) => state.isMatchPaused)
  const isSetPaused = useTimerStore((state) => state.isSetPaused)
  const modality = useTimerStore((state) => state.modality)
  const currentHalf = useTimerStore((state) => state.currentHalf)
  const notifications = useTimerStore((state) => state.notifications)
  const removeNotification = useTimerStore((state) => state.removeNotification)

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      <span className="text-lg font-bold">
        {currentHalf === 1 ? '1er Tiempo' : '2do Tiempo'}
      </span>

      <span className="text-sm uppercase tracking-wide text-gray-400">
        Modalidad: {modality}
      </span>

      <div className="flex gap-8">
        <div className="flex flex-col items-center">
          <span className="text-sm text-gray-400">Partido</span>
          <span className="text-5xl font-bold tabular-nums">{matchTime}</span>
          {isMatchPaused && <span className="text-red-500 text-sm font-semibold">PAUSADO</span>}
        </div>

        <div className="flex flex-col items-center">
          <span className="text-sm text-gray-400">Set</span>
          <span className="text-5xl font-bold tabular-nums">{setTime}</span>
          {isSetPaused && <span className="text-red-500 text-sm font-semibold">PAUSADO</span>}
        </div>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-sm">
        {notifications.map((n) => (
          <div key={n.id} className="bg-purple-100 text-purple-800 px-4 py-2 rounded flex items-center justify-between gap-3">
            <span>{n.text}</span>
            <button onClick={() => removeNotification(n.id)} className="font-bold">✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}