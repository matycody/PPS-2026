import { useTimerStore } from '../../stores/timerStore'

export function Timer() {
  const matchTime = useTimerStore((state) => state.matchTime)
  const setTime = useTimerStore((state) => state.setTime)
  const isMatchPaused = useTimerStore((state) => state.isMatchPaused)
  const isSetPaused = useTimerStore((state) => state.isSetPaused)
  const notifications = useTimerStore((state) => state.notifications)
  const removeNotification = useTimerStore((state) => state.removeNotification)

  // Visual: el Partido no llega marcado como pausado desde el backend al tocar 0:00
  // (a diferencia del Set), así que lo derivamos acá solo para mostrarlo igual.
  const matchLooksPaused = isMatchPaused || matchTime === '0:00'

  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex gap-3 w-full">
        <div className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-[18px] flex flex-col items-center gap-3">
          <div className="flex items-center justify-between w-full">
            <span className="font-bold text-xs uppercase text-[var(--color-text-secondary)]">Partido</span>
            <span className={`size-2 rounded-full ${matchLooksPaused ? 'bg-[var(--color-accent-red)]' : 'bg-[var(--color-accent-green)] animate-pulse'}`} />
          </div>
          <p className="font-['Big_Shoulders_Display'] font-extrabold text-[68px] leading-none text-[var(--color-accent-blue)] tabular-nums">
            {matchTime}
          </p>
          {matchLooksPaused && (
            <span className="bg-[rgba(255,46,95,0.1)] border border-[rgba(255,46,95,0.3)] text-[var(--color-accent-red)] text-[11px] font-extrabold uppercase px-2.5 py-1 rounded-md">
              Pausado
            </span>
          )}
        </div>

        <div className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl p-[18px] flex flex-col items-center gap-3">
          <div className="flex items-center justify-between w-full">
            <span className="font-bold text-xs uppercase text-[var(--color-text-secondary)]">Set</span>
            <span className={`size-2 rounded-full ${isSetPaused ? 'bg-[var(--color-accent-red)]' : 'bg-[var(--color-accent-green)] animate-pulse'}`} />
          </div>
          <p className="font-['Big_Shoulders_Display'] font-extrabold text-[68px] leading-none text-[var(--color-accent-green)] tabular-nums">
            {setTime}
          </p>
          {isSetPaused && (
            <span className="bg-[rgba(255,46,95,0.1)] border border-[rgba(255,46,95,0.3)] text-[var(--color-accent-red)] text-[11px] font-extrabold uppercase px-2.5 py-1 rounded-md">
              Pausado
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 w-full">
        {notifications.map((n) => (
          <div key={n.id} className="bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-primary)] px-4 py-2 rounded-xl flex items-center justify-between gap-3">
            <span>{n.text}</span>
            <button onClick={() => removeNotification(n.id)} className="font-bold text-[var(--color-text-secondary)]">✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}