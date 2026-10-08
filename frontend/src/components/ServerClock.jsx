import { useEffect, useState } from 'react'
import { api } from '../lib/api'

const TZ = 'America/Argentina/Buenos_Aires'
const FMT = new Intl.DateTimeFormat('es-AR', {
  timeZone: TZ,
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function label(d) {
  const p = Object.fromEntries(FMT.formatToParts(d).map((x) => [x.type, x.value]))
  const wd = (p.weekday || '').replace('.', '')
  return wd.charAt(0).toUpperCase() + wd.slice(1) + ' ' + p.day + '/' + p.month + ' \u00b7 ' + p.hour + ':' + p.minute
}

// Hora del servidor (GET /time): se calcula el desfase con el dispositivo compensando la demora de la red
// y se resincroniza cada 5 min. Sin conexión queda la hora del dispositivo.
export default function ServerClock() {
  const [offsetMs, setOffsetMs] = useState(0)
  const [text, setText] = useState(() => label(new Date()))

  useEffect(() => {
    let alive = true
    const sync = async () => {
      try {
        const t0 = Date.now()
        const r = await api('GET', '/time')
        const t1 = Date.now()
        if (alive && r?.now) setOffsetMs(r.now - (t0 + t1) / 2)
      } catch { /* sin conexión: se mantiene el último desfase */ }
    }
    sync()
    const id = setInterval(sync, 5 * 60 * 1000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  useEffect(() => {
    const tick = () => setText(label(new Date(Date.now() + offsetMs)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [offsetMs])

  return <span className="whitespace-nowrap font-mono text-[11px] font-semibold tabular-nums text-muted">{text}</span>
}
