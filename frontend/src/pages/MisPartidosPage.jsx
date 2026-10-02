import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { normMatch, fmtWhen } from '../lib/format'
import StatusPill from '../components/StatusPill'
import Versus from '../components/Versus'

const isPast = (s) => s === 'FINISHED' || s === 'CANCELLED'
const ORDER = { LIVE: 0, READY: 1, SCHEDULED: 2 }

function Card({ m }) {
  return (
    <Link to={'/partido/' + m.id} className="block rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <StatusPill status={m.status} />
        <span className="text-sm text-muted">Cancha {m.court}</span>
      </div>
      <div className="mt-3"><Versus a={m.teamA} b={m.teamB} /></div>
      <p className="mt-1 text-center text-sm text-muted">{fmtWhen(m.scheduledAt)}</p>
    </Link>
  )
}

export default function MisPartidosPage() {
  const [matches, setMatches] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    api('GET', '/me/profile')
      .then(async (d) => {
        const teams = d.profile?.teams ?? []
        const lists = await Promise.all(
          teams.map((t) => api('GET', '/matches?teamId=' + t.teamId).catch(() => []))
        )
        if (!alive) return
        const byId = new Map()
        lists.flat().forEach((m) => byId.set(m.id ?? m.matchId, normMatch(m)))
        setMatches([...byId.values()])
      })
      .catch((e) => { if (alive) setErr(e.message) })
    return () => { alive = false }
  }, [])

  if (err) return <p className="mt-10 text-center text-danger">{err}</p>
  if (matches === null) return <p className="mt-10 text-center text-muted">Cargando…</p>
  if (matches.length === 0) return <p className="mt-10 text-center text-muted">Todavía no tenés partidos.</p>

  const upcoming = matches
    .filter((m) => !isPast(m.status))
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? '')))
  const past = matches
    .filter((m) => isPast(m.status))
    .sort((a, b) => String(b.finishedAt ?? b.scheduledAt ?? '').localeCompare(String(a.finishedAt ?? a.scheduledAt ?? '')))

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-accent">Próximos</h2>
        {upcoming.length === 0 && <p className="text-sm text-muted">Sin partidos próximos.</p>}
        {upcoming.map((m) => <Card key={m.id} m={m} />)}
      </div>
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Jugados</h2>
        {past.length === 0 && <p className="text-sm text-muted">Todavía no jugaste ninguno.</p>}
        {past.map((m) => <Card key={m.id} m={m} />)}
      </div>
    </div>
  )
}
