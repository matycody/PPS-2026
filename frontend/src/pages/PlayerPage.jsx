import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { BRANCH, MODALITY, normMatch } from '../lib/format'
import TeamBadge from '../components/TeamBadge'
import MatchCard from '../components/MatchCard'
import ResultRow from '../components/ResultRow'

const Title = ({ children, n }) => (
  <h2 className="text-xs font-bold uppercase tracking-widest text-muted">{children}{n != null ? ' · ' + n : ''}</h2>
)
const year = (iso) => (iso ? new Date(iso).getFullYear() : '')

// Banner del jugador: solo muestra lo que la persona eligió hacer público
export default function PlayerPage() {
  const { id } = useParams()
  const [p, setP] = useState(null)
  const [err, setErr] = useState('')
  const [moreNext, setMoreNext] = useState(false)
  const [moreDone, setMoreDone] = useState(false)

  useEffect(() => {
    setP(null)
    api('GET', '/players/' + id)
      .then((r) => setP({ ...r, next: r.next.map(normMatch), recent: r.recent.map(normMatch) }))
      .catch((e) => setErr(e.message))
  }, [id])

  if (err) return <p className="mt-10 text-center text-danger">{err}</p>
  if (!p) return <p className="mt-10 text-center text-muted">Cargando…</p>

  const teamIds = [...p.teams.map((t) => t.teamId), ...p.history.map((t) => t.teamId)]
  const shownName = p.nickname || p.name

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-line bg-surface p-5 text-center">
        <div className="relative mx-auto h-24 w-24">
          {p.photoUrl ? (
            <img src={p.photoUrl} alt="" className="h-24 w-24 rounded-full border border-line object-cover" />
          ) : (
            <div className="grid h-24 w-24 place-items-center rounded-full bg-surface-2 text-3xl font-extrabold text-muted">
              {shownName.charAt(0).toUpperCase()}
            </div>
          )}
          {p.number != null && (
            <span className="absolute -bottom-1 -right-1 grid h-9 min-w-9 place-items-center rounded-full bg-accent px-1 font-mono text-sm font-extrabold text-black">
              {p.number}
            </span>
          )}
        </div>
        <h1 className="mt-3 text-2xl font-extrabold leading-tight">{p.name}</h1>
        {p.nickname && <p className="text-sm font-semibold text-accent">"{p.nickname}"</p>}
        {p.age != null && <p className="text-sm text-muted">{p.age} años</p>}
      </section>

      <section className="space-y-2">
        <Title n={p.teams.length}>Equipos que representa</Title>
        {p.teams.length === 0 && <p className="text-muted">Hoy no juega en ningún equipo.</p>}
        {p.teams.map((t) => (
          <Link key={t.teamId + t.branch} to={'/equipo/' + t.teamId} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <TeamBadge team={t} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{t.name}{t.coach ? ' (DT)' : ''}</p>
              <p className="text-xs text-muted">Desde {year(t.since)}</p>
            </div>
            <span className="flex flex-wrap justify-end gap-1">
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold uppercase">{BRANCH[t.branch]}</span>
              {t.modalities.map((m) => <span key={m} className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold uppercase text-accent">{MODALITY[m]}</span>)}
            </span>
          </Link>
        ))}
        {p.history.length > 0 && (
          <p className="text-xs text-muted">
            Antes: {p.history.map((t) => t.name + ' (' + BRANCH[t.branch].toLowerCase() + ', ' + year(t.from) + '–' + year(t.to) + ')').join(' · ')}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <Title n={p.next.length}>Próximos partidos</Title>
        {p.next.length === 0 && <p className="text-muted">No hay partidos programados.</p>}
        {(moreNext ? p.next : p.next.slice(0, 3)).map((m) => <MatchCard key={m.id} m={m} />)}
        {p.next.length > 3 && (
          <button onClick={() => setMoreNext((v) => !v)} className="w-full rounded-2xl border border-line bg-surface py-2 text-sm font-bold">
            {moreNext ? 'Ver menos' : 'Ver todos (' + p.next.length + ')'}
          </button>
        )}
      </section>

      <section className="space-y-2">
        <Title n={p.recent.length}>Partidos recientes</Title>
        {p.recent.length === 0 && <p className="text-muted">Todavía no hay resultados.</p>}
        {(moreDone ? p.recent : p.recent.slice(0, 5)).map((m) => <ResultRow key={m.id} m={m} teamIds={teamIds} />)}
        {p.recent.length > 5 && (
          <button onClick={() => setMoreDone((v) => !v)} className="w-full rounded-2xl border border-line bg-surface py-2 text-sm font-bold">
            {moreDone ? 'Ver menos' : 'Ver todos (' + p.recent.length + ')'}
          </button>
        )}
        <p className="text-[11px] text-muted">Son los partidos de sus equipos mientras formó parte de ellos.</p>
      </section>
    </div>
  )
}
