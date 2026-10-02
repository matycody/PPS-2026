import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../lib/api'
import { BRANCH } from '../lib/format'

export default function MiEquipoPage() {
  const [teams, setTeams] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api('GET', '/me/profile').then((d) => setTeams(d.profile?.teams ?? [])).catch((e) => setErr(e.message))
  }, [])

  if (err) return <p className="mt-10 text-center text-danger">{err}</p>
  if (teams === null) return <p className="mt-10 text-center text-muted">Cargando…</p>
  if (teams.length === 0) return <p className="mt-10 text-center text-muted">Todavía no tenés equipo asignado.</p>
  if (teams.length === 1) return <Navigate to={'/equipo/' + teams[0].teamId} replace />

  return (
    <div className="space-y-3">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Mis equipos</h1>
      {teams.map((t) => (
        <Link key={t.teamId + t.branch} to={'/equipo/' + t.teamId} className="flex items-center justify-between rounded-2xl border border-line bg-surface p-4">
          <span className="font-bold">{t.name}</span>
          <span className="text-sm text-muted">{BRANCH[t.branch] ?? t.branch}</span>
        </Link>
      ))}
    </div>
  )
}
