import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import TeamBadge from './TeamBadge'

const clock = (sec) => String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0')

function Side({ team, set }) {
  if (!team) return <div />
  return (
    <div className="flex min-w-0 items-center gap-2">
      <TeamBadge team={team} size="sm" />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{team.name}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Set {set}</p>
      </div>
    </div>
  )
}

// Sets del partido: quién ganó cada uno, el marcador resultante y el momento. Desplegable y de altura fija.
export default function ScoreTimeline({ m }) {
  const sets = m?.sets ?? []
  const [open, setOpen] = useState(true)
  if (!sets.length) return null
  const last = sets.length - 1
  const live = m.status === 'LIVE' || m.status === 'READY'

  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
        <span className="flex-1 text-sm font-extrabold uppercase tracking-wide">Sets</span>
        <span className="font-mono text-xs font-bold text-muted">{sets.length}</span>
        <ChevronDown size={18} className={'shrink-0 text-muted transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <ol className="max-h-80 divide-y divide-line overflow-y-auto overscroll-contain border-t border-line">
          {[...sets].reverse().map((s) => {
            const winner = s.draw ? null : s.winnerTeamId === m.teamA?.id ? 'A' : 'B'
            const now = live && s.number === sets[last].number
            return (
              <li key={s.number} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2.5">
                {winner === 'A' ? <Side team={m.teamA} set={s.number} /> : <div />}
                <div className="text-center">
                  <p className={'font-mono text-lg font-extrabold tabular-nums ' + (now ? 'text-live' : '')}>{s.scoreA}-{s.scoreB}</p>
                  <p className="font-mono text-[11px] font-bold tabular-nums text-muted">
                    {winner ? '' : 'Empate · Set ' + s.number + ' · '}{s.half && s.second != null ? s.half + 'T · ' + clock(s.second) : ''}
                  </p>
                </div>
                {winner === 'B' ? <div className="flex justify-end text-right"><Side team={m.teamB} set={s.number} /></div> : <div />}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
