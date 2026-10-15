import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { fmtWhen, courtLabel } from '../../lib/format'
import TeamBadge from '../TeamBadge'
import StatusPill from '../StatusPill'

function Side({ team, sets, won, placeholder }) {
  return (
    <div className={'flex items-center gap-2 px-3 py-2 ' + (won ? 'font-extrabold' : '')}>
      {team ? <TeamBadge team={team} size="sm" /> : <span className="h-8 w-8 shrink-0 rounded-full border border-dashed border-line" />}
      <span className={'min-w-0 flex-1 truncate ' + (team ? '' : 'text-sm italic text-muted')}>{team ? team.name : placeholder}</span>
      <span className="font-mono text-lg">{sets}</span>
    </div>
  )
}

function sourceLabel(f) {
  if (!f) return 'A definir'
  return (f.kind === 'LOSER' ? 'Perdedor' : 'Ganador') + ' de la llave anterior'
}

// base: prefijo del enlace al partido (público o de admin)
export default function BracketView({ tournamentId, stageId, base = '/partido/', reloadKey }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    api('GET', '/tournaments/' + tournamentId + '/stages/' + stageId + '/bracket')
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(e.message))
    return () => { alive = false }
  }, [tournamentId, stageId, reloadKey])

  if (err) return <p className="text-danger">{err}</p>
  if (!data) return <p className="text-muted">Cargando…</p>
  if (!data.rounds.length) return <p className="text-muted">Todavía no se armó la llave.</p>

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {data.rounds.map((r) => (
        <div key={r.round} className="w-64 shrink-0 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">{r.name}</p>
          {r.matches.map((m) => (
            <Link key={m.id} to={base + m.id} className="block overflow-hidden rounded-2xl border border-line bg-surface">
              {m.kind === 'THIRD_PLACE' && (
                <p className="bg-surface-2 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted">Tercer puesto</p>
              )}
              <Side team={m.teamA} sets={m.setsA} won={m.winnerTeamId && m.winnerTeamId === m.teamA?.id} placeholder={sourceLabel(m.feeds.A)} />
              <div className="border-t border-line" />
              <Side team={m.teamB} sets={m.setsB} won={m.winnerTeamId && m.winnerTeamId === m.teamB?.id} placeholder={sourceLabel(m.feeds.B)} />
              <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-2 px-3 py-1.5 text-[11px] text-muted">
                <span className="truncate">{m.scheduledAt ? fmtWhen(m.scheduledAt) : 'Sin fecha'} · {courtLabel(m.court)}</span>
                <StatusPill status={m.status} />
              </div>
            </Link>
          ))}
        </div>
      ))}
    </div>
  )
}
