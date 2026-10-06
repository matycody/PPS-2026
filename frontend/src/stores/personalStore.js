import { create } from 'zustand'

// Color personal de la persona (acento de la interfaz). Se guarda en este dispositivo.
// Cuando exista el campo colorBanner en el backend, se guarda tambien en el perfil.
const KEY = 'accent-color'
const HEX = /^#[0-9a-fA-F]{6}$/
const MIN_LUMINANCE = 0.18 // los botones llevan texto negro: el color no puede ser muy oscuro

function read() {
  try {
    const v = localStorage.getItem(KEY)
    return v && HEX.test(v) ? v : null
  } catch { return null }
}

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const toHex = (rgb) => '#' + rgb.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')

function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// Aclara de a poco los colores demasiado oscuros hasta que se lea el texto negro encima
export function readable(hex) {
  let c = hex.toLowerCase()
  for (let i = 0; i < 25 && luminance(c) < MIN_LUMINANCE; i++) {
    c = toHex(toRgb(c).map((v) => v + (255 - v) * 0.12))
  }
  return c
}

export const usePersonalStore = create((set) => ({
  accent: read(),
  setAccent: (hex) => {
    if (!HEX.test(hex)) return
    const c = readable(hex)
    try { localStorage.setItem(KEY, c) } catch { /* sin localStorage */ }
    set({ accent: c })
  },
  clearAccent: () => {
    try { localStorage.removeItem(KEY) } catch { /* sin localStorage */ }
    set({ accent: null })
  },
}))
