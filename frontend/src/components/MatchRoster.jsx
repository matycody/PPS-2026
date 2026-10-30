import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Users } from 'lucide-react'
import { api } from '../lib/api'
import { BRANCH } from '../lib/format'
import { personNumber } from '../lib/person'
import FavHeart from './FavHeart'
import { PlayerSanctionTag, playing } from './SanctionsCard'

const ORDER = ['MALE', 'MIXED', 'FEMALE']

// Nombre arriba y apellido abajo ("María José Gómez" → "María José" / "Gómez"); con apodo público, el apodo es el nombre
function splitName(r) {
  if (r.nickname) return { top: r.nickname, bottom: null }
  const parts = String(r.name ?? '').trim().split(/\s+/)
  if (parts.length < 2) return { top: parts[0] ?? '', bottom: null }
  return { top: parts.slice(0, -1).join(' '), bottom: parts[parts.length - 1] }
}

// Con número primero (de menor a mayor), después los que no tienen, por nombre
function byNumber(a, b) {
  const na = personNumber(a)
  const nb = personNumber(b)
  if (na != null && nb != null) return na - nb
  if (na != null) return -1
  if (nb != null) return 1
  return a.name.localeCompare(b.name, 'es')
}

function TeamRoster({ team, side, matchBranch, noLink, suspended, sanctions }) {
  const items = sanctions?.items ?? []
  const liveById = new Map((sanctions?.tick?.sanctions ?? []).map((x) => [x.id, x]))
  const left = sanctions ? playing(side, sanctions.tick, items) : 6
  // noLink: en la pantalla de control no se navega a los banners
  const L = ({ to, className, children }) => (noLink ? <span className={className}>{children}</span> : <Link to={to} className={className}>{children}</Link>)
  const [roster, setRoster] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!team?.id) return
    setRoster(null)
    api('GET', '/teams/' + team.id).then((t) => setRoster(t.roster ?? [])).catch((e) => setErr(e.message))
  }, [team?.id])

  const branches = ORDER.includes(matchBranch) ? [matchBranch] : ORDER // solo la rama del partido

  return (
    <section className="min-w-0 rounded-3xl border border-line bg-surface p-3">
      <h3 className="mb-3 truncate text-sm font-extrabold">{team?.id ? <L to={'/equipo/' + team.id}>{team.name}</L> : 'Por definir'}</h3>
      {left < 6 && <p className="-mt-2 mb-3 text-[11px] font-bold text-warn">Juega con {left}</p>}
      {!team?.id && <p className="text-sm text-muted">Equipo todavía sin definir.</p>}
      {err && <p className="text-sm text-danger">{err}</p>}
      {team?.id && !roster && !err && <p className="text-sm text-muted">Cargando…</p>}
      {roster && !roster.some((r) => branches.includes(r.branch)) && <p className="text-sm text-muted">Sin jugadores cargados en esta rama.</p>}
      {roster && (
        <div className="space-y-4">
          {branches.map((b) => {
            const list = roster.filter((r) => r.branch === b).sort((x, y) => Number(!!y.coach) - Number(!!x.coach) || byNumber(x, y))
            if (list.length === 0) return null
            return (
              <div key={b} className="space-y-1.5">
                <p className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-muted">
                  <span>{BRANCH[b] ?? b}{b === matchBranch ? ' ●' : ''}</span>
                  <span>{list.length}</span>
                </p>
                {list.map((r) => {
                  const n = personNumber(r)
                  const nm = splitName(r)
                  return (
                    <div key={r.profileId + r.branch} className="flex items-center rounded-xl bg-surface-2 text-xs">
                      <L to={'/jugador/' + r.profileId} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2">
                        <span className="w-8 shrink-0 font-mono text-[11px] font-bold text-muted">{n != null ? '#' + n : ''}</span>
                        <span className="min-w-0 flex-1 break-words font-semibold leading-tight">
                          {nm.top}
                          {r.coach && <span className="ml-1.5 text-[10px] font-bold text-accent">(DT)</span>}
                          {suspended?.has(r.profileId) && <span className="ml-1.5 rounded bg-danger/15 px-1 text-[10px] font-bold text-danger">SUSPENDIDO</span>}
                          {nm.bottom && <span className="block font-normal text-muted">{nm.bottom}</span>}
                          {items.filter((s) => s.player?.id === r.profileId).sort((x, y) => Number(!!liveById.get(y.id)) - Number(!!liveById.get(x.id))).map((s) => (
                            <span key={s.id} className="mt-1 block"><PlayerSanctionTag s={s} live={liveById.get(s.id)} /></span>
                          ))}
                        </span>
                      </L>
                      {noLink ? <span className="w-2" /> : <FavHeart type="PLAYER" id={r.profileId} name={r.name} compact />}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function MatchRoster({ teamA, teamB, branch, hideTitle, noLink, matchId, sanctions }) {
  const [suspended, setSuspended] = useState(null)
  useEffect(() => {
    if (!matchId) return
    api('GET', '/matches/' + matchId + '/suspended').then((r) => setSuspended(new Set((r.items ?? []).map((i) => i.profileId)))).catch(() => {})
  }, [matchId])
  return (
    <div className="space-y-4">
      {!hideTitle && <p className="text-xs font-bold uppercase tracking-widest text-muted">Jugadores disponibles</p>}
      <div className="grid grid-cols-2 items-start gap-3">
        <TeamRoster team={teamA} side="A" sanctions={sanctions} matchBranch={branch} noLink={noLink} suspended={suspended} />
        <TeamRoster team={teamB} side="B" sanctions={sanctions} matchBranch={branch} noLink={noLink} suspended={suspended} />
      </div>
    </div>
  )
}

// Para la mesa: cerrado por defecto, carga los jugadores recién al abrirlo
export function MatchRosterToggle(props) {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-3xl border border-line bg-surface">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
        <Users size={18} className="shrink-0 text-muted" />
        <span className="flex-1 text-xs font-bold uppercase tracking-widest text-muted">Jugadores</span>
        <ChevronDown size={18} className={'shrink-0 text-muted transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && <div className="border-t border-line p-3"><MatchRoster {...props} hideTitle noLink /></div>}
    </section>
  )
}