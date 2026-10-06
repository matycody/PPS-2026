import { useEffect, useState } from 'react'

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

// offsetMs: diferencia entre la hora del servidor y la del dispositivo
// (por ahora 0: usa la hora del dispositivo; cuando exista GET /time se le pasa el desfase)
export default function ServerClock({ offsetMs = 0 }) {
  const [text, setText] = useState(() => label(new Date(Date.now() + offsetMs)))

  useEffect(() => {
    const tick = () => setText(label(new Date(Date.now() + offsetMs)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [offsetMs])

  return <span className="whitespace-nowrap font-mono text-[11px] font-semibold tabular-nums text-muted">{text}</span>
}
