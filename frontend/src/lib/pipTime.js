// Formato y avance local de los relojes del reloj flotante
export const toSec = (s) => {
  const m = /^(\d+):(\d{2})$/.exec(String(s ?? ''))
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}
export const fmt = (sec) => (sec == null ? '--:--' : String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'))
// Segundos que quedan ahora: el último tick menos lo que pasó desde que llegó (si el reloj corre)
export const nowSec = (str, running, at) => {
  const s = toSec(str)
  if (s == null) return null
  return running ? Math.max(0, s - Math.floor((Date.now() - at) / 1000)) : s
}
