import { useRef } from 'react'
import { ImagePlus } from 'lucide-react'
import TeamBadge from './TeamBadge'

const MAX = 15 * 1024 * 1024

export default function LogoPicker({ name, src, onPick, onClear, onError, disabled, label = 'Escudo' }) {
  const ref = useRef(null)

  const change = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) return onError?.('El archivo no es una imagen')
    if (f.size > MAX) return onError?.('La imagen supera los 15 MB')
    onPick(f)
  }

  return (
    <div className="flex items-center gap-4">
      <TeamBadge team={{ name: name || '?', logo: src }} size="lg" />
      <div className="flex flex-col items-start gap-1">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">{label}</p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => ref.current?.click()}
          className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm font-bold disabled:opacity-40"
        >
          <ImagePlus size={16} /> {src ? 'Cambiar imagen' : 'Elegir imagen'}
        </button>
        {onClear && src && (
          <button type="button" onClick={onClear} className="text-xs font-semibold text-danger">Quitar</button>
        )}
        <p className="text-[11px] text-muted">Cualquier imagen · máx. 15 MB</p>
      </div>
      <input ref={ref} type="file" accept="image/*" onChange={change} className="hidden" />
    </div>
  )
}
