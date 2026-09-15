import { useTimerStore } from '../../stores/timerStore'

function SegmentToggle({ options, value, onChange }) {
  return (
    <div className="bg-[var(--color-track-bg)] border border-[var(--color-border)] rounded-full p-1 flex w-full">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-2.5 rounded-full text-[13px] font-bold uppercase transition-colors ${
            value === opt.value
              ? 'bg-[var(--color-accent-blue)] text-[#08090c]'
              : 'text-[var(--color-text-primary)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function GlobalToggles() {
  const currentHalf = useTimerStore((state) => state.currentHalf)
  const setHalf = useTimerStore((state) => state.setHalf)
  const modality = useTimerStore((state) => state.modality)
  const setModality = useTimerStore((state) => state.setModality)

  return (
    <div className="flex gap-3 w-full">
      <div className="flex-1 flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase text-[var(--color-text-secondary)]">
          Tiempo Actual
        </span>
        <SegmentToggle
          options={[{ value: 1, label: '1er Tiempo' }, { value: 2, label: '2do Tiempo' }]}
          value={currentHalf}
          onChange={setHalf}
        />
      </div>
      <div className="flex-1 flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase text-[var(--color-text-secondary)]">
          Modalidad
        </span>
        <SegmentToggle
          options={[{ value: 'foam', label: 'Foam' }, { value: 'cloth', label: 'Cloth' }]}
          value={modality}
          onChange={setModality}
        />
      </div>
    </div>
  )
}