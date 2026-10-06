import { create } from 'zustand'

// mode: 'light' | 'dark' | 'system'   (lo que eligio la persona)
// theme: 'light' | 'dark'             (lo que se aplica realmente)
const KEY = 'theme'
const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches

function readMode() {
  try {
    const s = localStorage.getItem(KEY)
    if (s === 'light' || s === 'dark' || s === 'system') return s
  } catch { /* sin localStorage */ }
  return 'dark'
}

const resolve = (mode) => (mode === 'system' ? (prefersDark() ? 'dark' : 'light') : mode)

function apply(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a0a0b' : '#f5f6f8')
}

const initialMode = readMode()

export const useThemeStore = create((set, get) => ({
  mode: initialMode,
  theme: resolve(initialMode),

  setMode: (mode) => {
    try { localStorage.setItem(KEY, mode) } catch { /* sin localStorage */ }
    const theme = resolve(mode)
    apply(theme)
    set({ mode, theme })
  },

  toggleTheme: () => get().setMode(get().theme === 'dark' ? 'light' : 'dark'),

  initTheme: () => {
    apply(get().theme)
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (get().mode !== 'system') return
      const theme = resolve('system')
      apply(theme)
      set({ theme })
    })
  },
}))
