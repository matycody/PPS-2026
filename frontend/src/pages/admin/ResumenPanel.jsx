import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Skeleton } from '../../components/ui'

const when = (iso) => new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const dm = (day) => day.slice(8) + '/' + day.slice(5, 7)

function Stat({ label, value, hint, tone }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className={'mt-1 font-mono text-3xl font-extrabold tabular-nums ' + (tone ?? '')}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  )
}

function Card({ title, children }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{title}</h3>
      {children}
    </section>
  )
}

// Resumen de un vistazo: actividad de la organización (GET /audit/summary) y estado general
export default function ResumenPanel() {
  const [s, setS] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => { api('GET', '/audit/summary').then(setS).catch((e) => setErr(e.message)) }, [])

  if (err) return <p className="text-danger">{err}</p>
  if (!s) return <Skeleton />

  const max = Math.max(1, ...s.perDay.map((d) => d.n))
  const secMax = Math.max(1, ...s.sections.map((x) => x.n))
  const st = s.state

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Movimientos hoy" value={s.today} tone="text-accent" />
        <Stat label="Promedio diario" value={s.avgPerDay} hint={'últimos ' + s.days + ' días'} />
        <Stat label="Últimos 7 días" value={s.week} hint="movimientos" />
        <Stat label="Personas activas" value={s.activePeople7d} hint="editaron en 7 días" />
      </div>

      <Card title={'Actividad · últimos ' + s.days + ' días'}>
        <div className="flex h-28 items-end gap-[2px]" role="img" aria-label="Movimientos por día">
          {s.perDay.map((d, i) => (
            <div key={d.day} title={dm(d.day) + ': ' + d.n} className="flex h-full flex-1 items-end">
              <div className={'w-full rounded-t-sm ' + (i === s.perDay.length - 1 ? 'bg-accent' : 'bg-accent/45')} style={{ height: Math.max(d.n ? 4 : 1, (d.n / max) * 100) + '%' }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] font-semibold text-muted">
          <span>{dm(s.perDay[0].day)}</span>
          <span>pico: {max}</span>
          <span>hoy</span>
        </div>
      </Card>

      <Card title="Estado general">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ['En vivo', st.matchesLive, st.matchesLive ? 'text-live' : ''],
            ['Pendientes', st.matchesPending],
            ['Finalizados', st.matchesFinished],
            ['Torneos activos', st.tournamentsActive],
            ['Equipos', st.teams],
            ['Usuarios', st.users],
          ].map(([l, v, tone]) => (
            <div key={l} className="rounded-xl bg-surface-2 px-1 py-2.5">
              <p className={'font-mono text-xl font-extrabold tabular-nums ' + (tone ?? '')}>{v}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase leading-tight text-muted">{l}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Qué se tocó más">
        <div className="space-y-2">
          {s.sections.map((x) => (
            <div key={x.key} className="flex items-center gap-3 text-sm">
              <span className="w-20 shrink-0 font-semibold">{x.label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent" style={{ width: (x.n / secMax) * 100 + '%' }} />
              </div>
              <span className="w-9 shrink-0 text-right font-mono text-xs font-bold tabular-nums text-muted">{x.n}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Quiénes editan más">
        {s.topActors.length === 0 && <p className="text-sm text-muted">Sin movimientos todavía.</p>}
        <ol className="space-y-1.5 text-sm">
          {s.topActors.map((a, i) => (
            <li key={(a.email ?? '?') + i} className="flex items-center gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-extrabold text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{a.email ?? 'Sin identificar'}</span>
              <span className="font-mono text-xs font-bold tabular-nums text-muted">{a.n}</span>
            </li>
          ))}
        </ol>
      </Card>

      {s.last && (
        <p className="px-1 text-xs text-muted">
          Último movimiento: <span className="font-semibold">{s.last.label}</span> · {s.last.by ?? '—'} · {when(s.last.at)}
        </p>
      )}
    </div>
  )
}
