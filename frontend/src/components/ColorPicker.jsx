import { usePersonalStore, readable } from '../stores/personalStore'

const PALETTE = [
  '#2f8cff', '#38bdf8', '#22d3ee', '#14b8a6', '#22c55e',
  '#84cc16', '#facc15', '#fbbf24', '#ff9a3c', '#f97316',
  '#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6',
  '#818cf8', '#f472b6', '#fb7185', '#34d399', '#94a3b8',
]

export default function ColorPicker() {
  const accent = usePersonalStore((s) => s.accent)
  const setAccent = usePersonalStore((s) => s.setAccent)
  const clearAccent = usePersonalStore((s) => s.clearAccent)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Mi color</p>
        {accent && (
          <button onClick={clearAccent} className="text-xs font-semibold text-accent">Usar el de mi rol</button>
        )}
      </div>
      <div className="grid grid-cols-10 gap-1.5">
        {PALETTE.map((c) => (
          <button
            key={c}
            aria-label={'Color ' + c}
            onClick={() => setAccent(c)}
            style={{ background: c }}
            className={'aspect-square rounded-full border-2 ' + (accent === readable(c) ? 'border-fg' : 'border-transparent')}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs font-semibold text-muted">
        <input
          type="color"
          value={accent ?? '#2f8cff'}
          onChange={(e) => setAccent(e.target.value)}
          className="h-8 w-10 rounded-lg border border-line bg-transparent"
        />
        Elegir otro color
      </label>
    </div>
  )
}
