import { Sun, Moon, Monitor } from 'lucide-react'
import { useThemeStore } from '../stores/themeStore'

const OPTIONS = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'system', label: 'Sistema', Icon: Monitor },
]

export function ThemeToggle() {
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)

  return (
    <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface-2 p-1">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          role="radio"
          aria-checked={mode === value}
          onClick={() => setMode(value)}
          className={'flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold ' + (mode === value ? 'bg-accent text-black' : 'text-muted')}
        >
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  )
}

export default ThemeToggle
