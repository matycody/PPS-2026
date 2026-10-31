import { useEffect, useState } from 'react'

// Color dominante de un escudo (para el fondo del banner). Se calcula una vez por imagen y se recuerda.
// Si la imagen no permite leerla (CORS) o es gris/blanca, devuelve null y el banner queda como siempre.
const cache = new Map()

function compute(url) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const S = 32
        const c = document.createElement('canvas')
        c.width = c.height = S
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, S, S)
        const { data } = ctx.getImageData(0, 0, S, S)
        const bins = new Map()
        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
          if (a < 200) continue
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          const sat = max === 0 ? 0 : (max - min) / max
          if (sat < 0.25 || max < 50 || min > 225) continue // gris, negro o blanco: no aportan color
          const key = (r >> 5) + ',' + (g >> 5) + ',' + (b >> 5)
          const e = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0, w: 0 }
          const w = sat // los colores más vivos pesan más
          e.n++; e.w += w; e.r += r * w; e.g += g * w; e.b += b * w
          bins.set(key, e)
        }
        let best = null
        for (const e of bins.values()) if (!best || e.w > best.w) best = e
        resolve(best && best.w > 3 ? 'rgb(' + Math.round(best.r / best.w) + ',' + Math.round(best.g / best.w) + ',' + Math.round(best.b / best.w) + ')' : null)
      } catch {
        resolve(null) // imagen "tainted": no se puede leer
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export function useDominantColor(url) {
  const [color, setColor] = useState(() => (url && cache.has(url) ? cache.get(url) : null))
  useEffect(() => {
    if (!url) { setColor(null); return undefined }
    if (cache.has(url)) { setColor(cache.get(url)); return undefined }
    let alive = true
    compute(url).then((c) => { cache.set(url, c); if (alive) setColor(c) })
    return () => { alive = false }
  }, [url])
  return color
}
