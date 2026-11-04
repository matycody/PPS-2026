import { Link } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import TeamBadge from './TeamBadge'

const BLOCK = { 1: 'h-20 bg-warn text-black', 2: 'h-14 bg-surface-2 text-fg', 3: 'h-10 bg-accent-soft text-fg' }

function Slot({ place, team, count }) {
  const crest = place === 1 ? 'lg' : 'md'
  const body = (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-end">
      {place === 1 && <Trophy size={20} className="mb-1 text-warn" />}
      {team !== undefined && <TeamBadge team={team ?? { name: '?' }} size={crest} />}
      {team !== undefined && <p className="mt-1 w-full truncate px-1 text-center text-[11px] font-extrabold">{team?.name ?? '—'}</p>}
      <div className={'mt-1 grid w-full place-items-center rounded-t-xl text-2xl font-extrabold ' + BLOCK[place]}>
        {count ?? place}
      </div>
      <p className="w-full bg-surface-2 py-0.5 text-center text-[9px] font-bold uppercase tracking-widest text-muted">{place}.º lugar</p>
    </div>
  )
  return team?.id ? <Link to={'/equipo/' + team.id} className="flex min-w-0 flex-1">{body}</Link> : body
}

// podium: { first, second, third, full } del backend. Liga sola (full=false): solo el campeón.
export default function Podium({ podium, className = '' }) {
  if (!podium?.first) return null
  if (!podium.full) {
    return (
      <Link to={'/equipo/' + podium.first.id} className={'flex items-center gap-3 rounded-2xl border border-warn bg-surface p-3 ' + className}>
        <TeamBadge team={podium.first} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-warn">1.º lugar · Campeón</p>
          <p className="truncate text-lg font-extrabold">{podium.first.name}</p>
        </div>
        <Trophy size={26} className="shrink-0 text-warn" />
      </Link>
    )
  }
  return (
    <div className={'flex items-end gap-1.5 rounded-2xl border border-line bg-surface p-3 ' + className}>
      <Slot place={2} team={podium.second} />
      <Slot place={1} team={podium.first} />
      <Slot place={3} team={podium.third} />
    </div>
  )
}

// Medallero de un equipo (banner): mismo podio 2-1-3 con la cantidad de veces que quedó en cada puesto.
export function MedalPodium({ gold = 0, silver = 0, bronze = 0, className = '' }) {
  if (!gold && !silver && !bronze) return null
  return (
    <div className={'flex items-end gap-1.5 ' + className}>
      <Slot place={2} count={silver} />
      <Slot place={1} count={gold} />
      <Slot place={3} count={bronze} />
    </div>
  )
}
