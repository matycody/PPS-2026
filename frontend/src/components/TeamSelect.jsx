import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import TeamBadge from './TeamBadge'

// Selector de equipo con escudos y buscador (reemplaza al <select> nativo, que no puede mostrar imágenes).
export default function TeamSelect({ teams, value, onChange, placeholder = 'Elegí un equipo' }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)
  const sel = teams.find((t) => t.id === value)
  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    return n ? teams.filter((t) => t.name.toLowerCase().includes(n)) : teams
  }, [teams, q])

  useEffect(() => {
    if (!open) return
    const out = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', out)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', out); document.removeEventListener('keydown', esc) }
  }, [open])

  const pick = (id) => { onChange(id); setOpen(false); setQ('') }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2 rounded-2xl border border-line bg-surface p-2 text-left">
        {sel ? <TeamBadge team={sel} size="sm" /> : <div className="h-8 w-8 shrink-0 rounded-full bg-surface-2" />}
        <span className={'min-w-0 flex-1 truncate text-sm font-semibold ' + (sel ? '' : 'text-muted')}>{sel ? sel.name : placeholder}</span>
        {sel && <span role="button" aria-label="Quitar" onClick={(e) => { e.stopPropagation(); pick('') }} className="grid h-7 w-7 place-items-center rounded-full text-muted"><X size={14} /></span>}
        <ChevronDown size={16} className={'shrink-0 text-muted transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search size={14} className="shrink-0 text-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar equipo…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto p-1.5">
            {list.length === 0 && <li className="px-3 py-3 text-sm text-muted">Sin resultados</li>}
            {list.map((t) => (
              <li key={t.id} role="option" aria-selected={t.id === value}>
                <button type="button" onClick={() => pick(t.id)} className={'flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left ' + (t.id === value ? 'bg-accent-soft' : 'active:bg-surface-2')}>
                  <TeamBadge team={t} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.name}</span>
                  {t.id === value && <Check size={16} className="shrink-0 text-accent" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
