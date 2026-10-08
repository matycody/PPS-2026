import { useEffect, useState } from 'react'
import { ChevronDown, Users } from 'lucide-react'
import { api } from '../lib/api'
import { BRANCH } from '../lib/format'
import { personNumber } from '../lib/person'

const ORDER = ['MALE', 'MIXED', 'FEMALE']

// Con número primero (de menor a mayor), después los que no tienen, por nombre
function byNumber(a, b) {
  const na = personNumber(a)
  const nb = personNumber(b)
  if (na != null && nb != null) return na - nb
  if (na != null) return -1
  if (nb != null) return 1
  return a.name.localeCompare(b.name, 'es')
}

function TeamRoster({ team, matchBranch }) {
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
      <h3 className="mb-3 truncate text-sm font-extrabold">{team?.name ?? 'Por definir'}</h3>
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
                  return (
                    <div key={r.profileId + r.branch} className="flex items-center gap-2 rounded-xl bg-surface-2 px-2 py-2 text-xs">
                      <span className="w-8 shrink-0 font-mono text-[11px] font-bold text-muted">{n != null ? '#' + n : ''}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {r.name}
                        {r.coach && <span className="ml-1.5 text-[10px] font-bold text-accent">(DT)</span>}
                      </span>
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

export default function MatchRoster({ teamA, teamB, branch, hideTitle }) {
  return (
    <div className="space-y-4">
      {!hideTitle && <p className="text-xs font-bold uppercase tracking-widest text-muted">Jugadores disponibles</p>}
      <div className="grid grid-cols-2 items-start gap-3">
        <TeamRoster team={teamA} matchBranch={branch} />
      <TeamRoster team={teamB} matchBranch={branch} />
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
      {open && <div className="border-t border-line p-3"><MatchRoster {...props} hideTitle /></div>}
    </section>
  )
}