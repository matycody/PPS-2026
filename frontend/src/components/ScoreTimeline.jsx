import TeamBadge from './TeamBadge'

const clock = (sec) => String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0')

// Cómo se fue dando el partido: el marcador después de cada set (0-1, 1-1, 2-1…), quién lo ganó y en qué momento.
// Queda guardado para siempre: se ve en vivo y también en el historial.
export default function ScoreTimeline({ m }) {
  const sets = m?.sets ?? []
  if (!sets.length) return null
  const last = sets.length - 1
  const live = m.status === 'LIVE' || m.status === 'READY'

  return (
    <div className="mt-6 border-t border-line pt-4">
      <h3 className="text-center text-[11px] font-bold uppercase tracking-widest">Cómo se fue dando</h3>
      <ol className="mx-auto mt-4 max-w-sm">
        {sets.map((s, i) => {
          const winner = s.draw ? null : s.winnerTeamId === m.teamA?.id ? m.teamA : m.teamB
          const now = live && i === last
          return (
            <li key={s.number} className="relative flex items-center gap-3 pb-4 pl-7 last:pb-0">
              {i < last && <span className="absolute bottom-0 left-[9px] top-5 w-0.5 bg-line" aria-hidden />}
              <span className={'absolute left-0 top-1 grid h-5 w-5 place-items-center rounded-full border-2 bg-surface ' + (now ? 'border-live' : 'border-line')} aria-hidden>
                <span className={'h-2 w-2 rounded-full ' + (now ? 'bg-live' : 'bg-line')} />
              </span>
              <span className={'w-16 shrink-0 font-mono text-xl font-extrabold tabular-nums ' + (now ? 'text-live' : '')}>{s.scoreA}-{s.scoreB}</span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {winner && <TeamBadge team={winner} size="sm" />}
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{winner ? winner.name : 'Empate'}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide">Set {s.number}</p>
                </div>
              </div>
              {s.half && s.second != null && (
                <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 font-mono text-xs font-bold tabular-nums">{s.half}T · {clock(s.second)}</span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
