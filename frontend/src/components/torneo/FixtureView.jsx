import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { fmtWhen, courtLabel } from '../../lib/format'
import { Btn, Alert, inputCls } from '../ui'
import StatusPill from '../StatusPill'

function MatchdayCard({ md, tournamentId, admin, base, onChanged, setErr }) {
  const [date, setDate] = useState(md.date ? md.date.slice(0, 10) : '')
  const [courts, setCourts] = useState(1)
  const [busy, setBusy] = useState(false)

  async function run(fn) {
    setBusy(true); setErr('')
    try { await fn(); await onChanged() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const saveDate = () => run(() => api('PATCH', '/tournaments/' + tournamentId + '/matchdays/' + md.id, {
    date: date ? date + 'T15:00:00.000Z' : null,
  }))
  const assign = () => run(() => api('POST', '/tournaments/' + tournamentId + '/matchdays/' + md.id + '/assign-courts', {
    courts: Number(courts),
  }))

  return (
    <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <p className="text-sm font-bold">
        Fecha {md.number}
        <span className="ml-2 font-normal text-muted">{md.date ? new Date(md.date).toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }) : 'Sin día'}</span>
      </p>
      {admin && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted">Día
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <Btn onClick={saveDate} disabled={busy}>Guardar día</Btn>
          <label className="w-24 text-xs text-muted">Canchas
            <input type="number" min="1" className={inputCls} value={courts} onChange={(e) => setCourts(e.target.value)} />
          </label>
          <Btn onClick={assign} disabled={busy}>Asignar canchas</Btn>
        </div>
      )}
      <div className="space-y-2">
        {md.matches.map((m) => (
          <Link key={m.id} to={base + m.id} className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate font-semibold">{m.teamA?.name ?? '—'} vs {m.teamB?.name ?? '—'}</span>
            <span className="shrink-0 text-xs text-muted">{m.scheduledAt ? fmtWhen(m.scheduledAt) : 'Sin hora'} · {courtLabel(m.court)}</span>
            <StatusPill status={m.status} />
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function FixtureView({ tournamentId, admin = false, base = '/partido/', reloadKey, onLoaded }) {
  const [days, setDays] = useState(null)
  const [err, setErr] = useState('')

  const load = () => api('GET', '/tournaments/' + tournamentId + '/matchdays')
    .then((d) => { setDays(d); onLoaded?.(d) })
    .catch((e) => setErr(e.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [tournamentId, reloadKey])

  if (!days) return err ? <p className="text-danger">{err}</p> : <p className="text-muted">Cargando…</p>
  if (!days.length) return <p className="text-muted">Todavía no hay fixture.</p>

  const byStage = []
  for (const d of days) {
    let g = byStage.find((x) => x.id === d.stage.id)
    if (!g) byStage.push((g = { id: d.stage.id, name: d.stage.name, days: [] }))
    g.days.push(d)
  }
  return (
    <div className="space-y-5">
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {byStage.map((g) => (
        <div key={g.id} className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">{g.name}</p>
          {g.days.map((md) => (
            <MatchdayCard key={md.id} md={md} tournamentId={tournamentId} admin={admin} base={base} onChanged={load} setErr={setErr} />
          ))}
        </div>
      ))}
    </div>
  )
}
