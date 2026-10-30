import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { CalendarDays } from 'lucide-react'
import { api } from '../lib/api'
import { BRANCH, fmtWhen, normMatch } from '../lib/format'
import TeamBadge from '../components/TeamBadge'

const ACTIVE = ['LIVE', 'READY', 'SCHEDULED']

// Tarjeta de un equipo que represento (equipo + rama): mismo estilo que el banner del equipo
function TeamCard({ t, next }) {
  const live = next?.status === 'LIVE'
  const rival = next ? (next.teamA?.id === t.teamId ? next.teamB : next.teamA) : null
  return (
    <Link to={'/equipo/' + t.teamId} className="block overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="relative px-5 pb-12 pt-5">
        <p className="pr-24 text-3xl font-extrabold leading-tight">{t.name}</p>
        <p className="mt-1 text-xs text-muted">{t.since ? 'En el equipo desde ' + new Date(t.since).getFullYear() : ''}{t.coach ? ' · DT' : ''}</p>
      </div>
      <div className="relative flex min-h-14 items-center bg-accent-soft py-3 pl-5 pr-28">
        <span className="rounded-full bg-accent px-3 py-1 text-[11px] font-extrabold uppercase text-black">{BRANCH[t.branch] ?? t.branch}</span>
        <div className="absolute -top-10 right-4"><TeamBadge team={t} size="lg" /></div>
      </div>
      <div className="flex items-center gap-2 px-5 py-3 text-sm">
        <CalendarDays size={16} className="shrink-0 text-muted" />
        {next === undefined && <span className="text-muted">Cargando…</span>}
        {next === null && <span className="text-muted">Sin partidos programados</span>}
        {next && (
          <span className="min-w-0 truncate">
            {live && <b className="mr-1.5 text-live">EN VIVO</b>}
            <span className="font-bold">vs {rival?.name ?? 'Por definir'}</span>
            <span className="text-muted"> · {fmtWhen(next.scheduledAt)}</span>
          </span>
        )}
      </div>
    </Link>
  )
}

export default function MiEquipoPage() {
  const [teams, setTeams] = useState(null)
  const [next, setNext] = useState({}) // key equipo+rama -> partido | null
  const [err, setErr] = useState('')

  useEffect(() => {
    api('GET', '/me/profile').then((d) => setTeams(d.profile?.teams ?? [])).catch((e) => setErr(e.message))
  }, [])

  // Próximo partido de cada equipo en la rama que representa
  useEffect(() => {
    if (!teams || teams.length < 2) return
    const ids = [...new Set(teams.map((t) => t.teamId))]
    Promise.all(ids.map((tid) => api('GET', '/matches?teamId=' + tid + '&limit=200').then((r) => [tid, r.map(normMatch)]).catch(() => [tid, []]))).then((all) => {
      const byTeam = Object.fromEntries(all)
      const out = {}
      for (const t of teams) {
        const list = (byTeam[t.teamId] ?? []).filter((m) => m.branch === t.branch && ACTIVE.includes(m.status)).sort((a, b) => (a.status === 'LIVE' ? -1 : 0) - (b.status === 'LIVE' ? -1 : 0) || new Date(a.scheduledAt ?? 8.64e15) - new Date(b.scheduledAt ?? 8.64e15))
        out[t.teamId + t.branch] = list[0] ?? null
      }
      setNext(out)
    })
  }, [teams])

  if (err) return <p className="mt-10 text-center text-danger">{err}</p>
  if (teams === null) return <p className="mt-10 text-center text-muted">Cargando…</p>
  if (teams.length === 0) return <p className="mt-10 text-center text-muted">Todavía no tenés equipo asignado.</p>
  if (teams.length === 1) return <Navigate to={'/equipo/' + teams[0].teamId} replace />

  return (
    <div className="space-y-5">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Mis equipos · {teams.length}</h1>
      {teams.map((t) => <TeamCard key={t.teamId + t.branch} t={t} next={next[t.teamId + t.branch]} />)}
    </div>
  )
}
