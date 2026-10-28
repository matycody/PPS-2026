import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Maximize2 } from 'lucide-react'
import { api } from '../../lib/api'
import { fmtWhen, courtLabel } from '../../lib/format'
import TeamBadge from '../TeamBadge'
import GoTo from '../GoTo'
import StatusPill from '../StatusPill'
import BracketCanvas from './BracketCanvas'
import BracketFullscreen from './BracketFullscreen'

function Side({ team, from, sets, won, placeholder }) {
  // Hasta que termina la zona se muestra el lugar ("2° Zona A") y no el equipo
  const pending = !!from && !from.done
  const shown = pending ? null : team
  const who = (
    <>
      {shown ? <TeamBadge team={shown} size="sm" /> : <span className="h-8 w-8 shrink-0 rounded-full border border-dashed border-line" />}
      <span className={'min-w-0 flex-1 truncate ' + (shown ? '' : pending ? 'text-sm font-bold' : 'text-sm italic text-muted')}>{shown ? shown.name : pending ? from.label : placeholder}</span>
    </>
  )
  return (
    <div className={'flex flex-1 items-center gap-2 px-3 ' + (won ? 'font-extrabold' : '')}>
      {shown?.id ? <GoTo to={'/equipo/' + shown.id} className="flex min-w-0 flex-1 items-center gap-2">{who}</GoTo> : <div className="flex min-w-0 flex-1 items-center gap-2">{who}</div>}
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
  const [full, setFull] = useState(false)

  useEffect(() => {
    let alive = true
    api('GET', '/tournaments/' + tournamentId + '/stages/' + stageId + '/bracket')
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(e.message))
    return () => { alive = false }
  }, [tournamentId, stageId, reloadKey])

  // Cada partido se centra entre los que lo alimentan; los que arrancan con equipos se apilan
  const rounds = useMemo(() => (data?.rounds ?? []).map((r) => ({
    key: r.round,
    title: r.name,
    items: [...r.matches].sort((a, b) => a.slot - b.slot).map((m) => ({
      key: m.id,
      h: m.kind === 'THIRD_PLACE' ? 160 : 138,
      feeders: [m.feeds.A?.matchId, m.feeds.B?.matchId].filter(Boolean),
      node: (
        <Link to={base + m.id} className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface">
          {m.kind === 'THIRD_PLACE' && (
            <p className="bg-surface-2 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-muted">Tercer puesto</p>
          )}
          <Side team={m.teamA} from={m.fromA} sets={m.setsA} won={m.winnerTeamId && m.winnerTeamId === m.teamA?.id} placeholder={sourceLabel(m.feeds.A)} />
          <div className="border-t border-line" />
          <Side team={m.teamB} from={m.fromB} sets={m.setsB} won={m.winnerTeamId && m.winnerTeamId === m.teamB?.id} placeholder={sourceLabel(m.feeds.B)} />
          <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-2 px-3 py-1.5 text-[11px] text-muted">
            <span className="truncate">{m.scheduledAt ? fmtWhen(m.scheduledAt) : 'Sin fecha'} · {courtLabel(m.court)}</span>
            <StatusPill status={m.status} />
          </div>
        </Link>
      ),
    })),
  })), [data, base])

  if (err) return <p className="text-danger">{err}</p>
  if (!data) return <p className="text-muted">Cargando…</p>
  if (!data.rounds.length) return <p className="text-muted">Todavía no se armó la llave.</p>

  const canvas = <BracketCanvas rounds={rounds} colW={240} gap={32} />
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button type="button" onClick={() => setFull(true)} className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-bold">
          <Maximize2 size={16} /> Ver completo
        </button>
      </div>
      {canvas}
      {full && <BracketFullscreen onClose={() => setFull(false)}>{canvas}</BracketFullscreen>}
    </div>
  )
}