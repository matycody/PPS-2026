import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { BRANCH, MODALITY, normMatch } from '../lib/format'
import TeamBadge from '../components/TeamBadge'
import FavHeart from '../components/FavHeart'
import MatchRow from '../components/MatchRow'
import ResultRow from '../components/ResultRow'

const Title = ({ children, n }) => (
  <h2 className="text-xs font-bold uppercase tracking-widest text-muted">{children}{n != null ? ' · ' + n : ''}</h2>
)
const month = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' }).replace('.', '') : '')

// Nombre arriba (liviano) y apellido abajo (fuerte); con apodo público, el apodo es el nombre
function splitName(p) {
  if (p.nickname) return { top: p.nickname, bottom: null }
  const parts = String(p.name ?? '').trim().split(/\s+/)
  if (parts.length < 2) return { top: parts[0] ?? '', bottom: null }
  return { top: parts.slice(0, -1).join(' '), bottom: parts[parts.length - 1] }
}

function Avatar({ p, size = 'h-28 w-28', text = 'text-4xl' }) {
  const initial = (p.nickname || p.name || '?').charAt(0).toUpperCase()
  return p.photoUrl ? (
    <img src={p.photoUrl} alt="" className={size + ' rounded-full border-2 border-bg bg-surface object-cover'} />
  ) : (
    <div className={size + ' grid place-items-center rounded-full border-2 border-bg bg-surface-2 font-extrabold text-muted ' + text}>{initial}</div>
  )
}

// "También en <equipo>": compañeros del equipo actual, en carrusel horizontal
function Teammates({ team, selfId }) {
  const [list, setList] = useState(null)
  useEffect(() => {
    api('GET', '/teams/' + team.teamId).then((t) => setList((t.roster ?? []).filter((r) => r.profileId !== selfId && r.branch === team.branch))).catch(() => setList([]))
  }, [team.teamId, team.branch, selfId])
  if (!list?.length) return null
  return (
    <section className="space-y-2">
      <Title>También en {team.name}</Title>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {list.map((r) => {
          const nm = splitName(r)
          return (
            <Link key={r.profileId} to={'/jugador/' + r.profileId} className="w-36 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="h-16 px-3 pt-3">
                <p className="truncate text-sm leading-tight text-muted">{nm.bottom ? nm.top : ' '}</p>
                <p className="truncate text-base font-extrabold leading-tight">{nm.bottom ?? nm.top}</p>
              </div>
              <div className="relative flex h-14 items-center bg-accent-soft px-3">
                <TeamBadge team={team} size="sm" />
                <span className="absolute -top-5 right-3 grid h-14 w-14 place-items-center rounded-full border-2 border-bg bg-surface-2 text-lg font-extrabold text-muted">
                  {(r.nickname || r.name).charAt(0).toUpperCase()}
                </span>
                {r.number != null && <span className="ml-auto mr-0 pt-8 font-mono text-xs font-bold text-muted">#{r.number}</span>}
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// Círculo con el valor grande y su nombre abajo (estilo "mejores estadísticas")
function Stat({ value, label, tone = '' }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className={'grid h-16 w-16 place-items-center rounded-full border-2 border-line bg-surface-2 font-mono text-xl font-extrabold tabular-nums ' + tone}>{value}</span>
      <span className="text-xs font-semibold leading-tight text-muted">{label}</span>
    </div>
  )
}
const pct = (s) => (s.played ? Math.round((s.won / s.played) * 100) + '%' : '–')

function Block({ title, s }) {
  return (
    <section className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <Title>{title}</Title>
      <div className="grid grid-cols-4 gap-2">
        <Stat value={s.played} label="Partidos" />
        <Stat value={s.won} label="Ganados" tone="text-live" />
        <Stat value={s.lost} label="Perdidos" tone="text-danger" />
        <Stat value={pct(s)} label="Efectividad" tone="text-accent" />
      </div>
      <p className="text-center text-xs text-muted">{s.drawn} empatados · {s.pointsFor} puntos a favor · {s.pointsAgainst} en contra</p>
    </section>
  )
}

// Banner del jugador: solo muestra lo que la persona eligió hacer público
export default function PlayerPage() {
  const { id } = useParams()
  const [p, setP] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('resumen')
  const [moreNext, setMoreNext] = useState(false)
  const [moreDone, setMoreDone] = useState(false)

  useEffect(() => {
    setP(null)
    setTab('resumen')
    api('GET', '/players/' + id)
      .then((r) => setP({ ...r, next: r.next.map(normMatch), recent: r.recent.map(normMatch) }))
      .catch((e) => setErr(e.message))
  }, [id])

  if (err) return <p className="mt-10 text-center text-danger">{err}</p>
  if (!p) return <p className="mt-10 text-center text-muted">Cargando…</p>

  const teamIds = [...p.teams.map((t) => t.teamId), ...p.history.map((t) => t.teamId)]
  const nm = splitName(p)
  const main = p.teams[0]

  return (
    <div className="-mt-1 space-y-5">
      {/* Banner: nombre arriba, franja con el equipo y la foto encimada */}
      <section className="overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="relative px-5 pb-16 pt-5">
          <div className="absolute right-3 top-3"><FavHeart type="PLAYER" id={p.id ?? id} name={p.name} /></div>
          <p className="pr-10 text-2xl font-light leading-tight">{nm.bottom ? nm.top : ' '}</p>
          <h1 className="pr-10 text-3xl font-extrabold leading-tight">{nm.bottom ?? nm.top}</h1>
          {p.nickname && <p className="text-sm font-semibold text-accent">{p.name}</p>}
          {p.age != null && <p className="text-xs text-muted">{p.age} años</p>}
        </div>
        <div className="relative flex h-16 items-center gap-3 bg-accent-soft px-5">
          {main ? (
            <Link to={'/equipo/' + main.teamId} className="flex min-w-0 items-center gap-3">
              <TeamBadge team={main} size="md" />
              <span className="min-w-0 truncate text-lg font-extrabold">{main.name}</span>
            </Link>
          ) : <span className="text-sm font-semibold text-muted">Sin equipo actual</span>}
          <div className="absolute -top-14 right-5">
            <Avatar p={p} />
            {p.number != null && (
              <span className="absolute -bottom-1 -right-1 grid h-9 min-w-9 place-items-center rounded-full bg-accent px-1 font-mono text-sm font-extrabold text-black">{p.number}</span>
            )}
          </div>
        </div>
        <div className="flex border-t border-line" role="tablist">
          {[['resumen', 'Resumen'], ['estadisticas', 'Estadísticas'], ['carrera', 'Carrera']].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={'flex-1 border-b-2 py-3 text-sm font-bold ' + (tab === k ? 'border-accent' : 'border-transparent text-muted')}>
              {label}
            </button>
          ))}
        </div>
      </section>

      {tab === 'resumen' && (
        <>
          <section className="space-y-2">
            <Title n={p.next.length}>Próximos partidos</Title>
            {p.next.length === 0 && <p className="text-muted">No hay partidos programados.</p>}
            {(moreNext ? p.next : p.next.slice(0, 3)).map((m) => <MatchRow key={m.id} m={m} />)}
            {p.next.length > 3 && (
              <button onClick={() => setMoreNext((v) => !v)} className="w-full rounded-2xl border border-line bg-surface py-2 text-sm font-bold">
                {moreNext ? 'Ver menos' : 'Ver todos (' + p.next.length + ')'}
              </button>
            )}
          </section>

          {main && <Teammates team={main} selfId={p.id ?? id} />}

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
        </>
      )}

      {tab === 'estadisticas' && (
        <div className="space-y-4">
          {!p.stats || p.stats.total.played === 0 ? (
            <p className="rounded-3xl border border-line bg-surface p-6 text-center text-sm text-muted">Todavía no hay partidos terminados con sus equipos.</p>
          ) : (
            <>
              <Block title="Con sus equipos" s={p.stats.total} />
              {['FOAM', 'CLOTH'].filter((k) => p.stats[k].played > 0).map((k) => <Block key={k} title={MODALITY[k]} s={p.stats[k]} />)}
            </>
          )}
          <p className="text-[11px] text-muted">Son los resultados de sus equipos mientras formó parte de ellos. Las estadísticas individuales (quemadas y atajadas) llegan cuando se carguen en los partidos.</p>
        </div>
      )}

      {tab === 'carrera' && (
        <section className="space-y-2">
          <Title n={p.teams.length + p.history.length}>Historial de equipos</Title>
          {p.teams.length + p.history.length === 0 && <p className="text-muted">Todavía no tiene equipos.</p>}
          {[...p.teams.map((t) => ({ ...t, from: t.since, to: null })), ...p.history].map((t) => (
            <Link key={t.teamId + t.branch + t.from} to={'/equipo/' + t.teamId} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
              <TeamBadge team={t} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{t.name}{t.coach ? ' (DT)' : ''}</p>
                <p className="text-xs text-muted">{month(t.from)} – {t.to ? month(t.to) : 'Ahora'}</p>
              </div>
              <span className="flex flex-col items-end gap-1">
                <span className="flex flex-wrap justify-end gap-1">
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold uppercase">{BRANCH[t.branch]}</span>
                  {t.modalities?.map((m) => <span key={m} className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold uppercase text-accent">{MODALITY[m]}</span>)}
                </span>
                {t.stint && <span className="font-mono text-[11px] font-bold text-muted">{t.stint.played} PJ · {t.stint.won} G</span>}
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  )
}
