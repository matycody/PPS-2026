import { useThemeStore } from '../stores/themeStore'

export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)

  return (
    <button
      onClick={toggleTheme}
      aria-label="Cambiar tema"
      className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full w-9 h-9 flex items-center justify-center text-[var(--color-text-primary)]"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}