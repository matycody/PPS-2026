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

// Aviso del reloj según la modalidad (mismos textos que la web). El partido NO se da por terminado al llegar a 00:00:
// eso lo decide la mesa/árbitro (finished = matchEnded o estado FINISHED).
export const pipNotice = (cloth, mLeft, sLeft, finished) =>
  finished || (mLeft !== 0 && sLeft !== 0) ? '' : cloth ? 'SET FINALIZADO' : 'MUERTE SÚBITA (NO HAY ESCUDO)'
