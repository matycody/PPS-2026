import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { Skeleton } from '../components/ui'

const PICK = (p, m) => (p === 'A' ? m.teamA?.name : p === 'B' ? m.teamB?.name : 'Empate')
const RESULT = {
  HIT: { label: 'Acertó', cls: 'bg-live/15 text-live' },
  MISS: { label: 'Falló', cls: 'bg-danger/15 text-danger' },
  PENDING: { label: 'Pendiente', cls: 'bg-surface-2 text-muted' },
  VOID: { label: 'Sin resultado', cls: 'bg-surface-2 text-muted' },
}

function Mine({ data }) {
  if (!data) return <Skeleton />
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Puntos', data.total], ['Aciertos', data.hits], ['Resueltas', data.settled]].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-line bg-surface p-3">
            <p className="text-2xl font-extrabold tabular-nums">{v}</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{l}</p>
          </div>
        ))}
      </div>
      {data.predictions.length === 0 && <p className="rounded-2xl border border-line bg-surface p-4 text-sm">Todavía no predijiste ningún partido. Entrá a un partido que no empezó y elegí quién gana.</p>}
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {data.predictions.map((p) => {
          const r = RESULT[p.result]
          return (
            <Link key={p.matchId} to={'/partido/' + p.matchId} className="flex items-center justify-between gap-3 px-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{p.match.teamA?.name} vs {p.match.teamB?.name}</p>
                <p className="truncate text-xs text-muted">Elegiste: {PICK(p.pick, p.match)}</p>
              </div>
              <span className={'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase ' + r.cls}>{p.result === 'HIT' ? '+' + p.earned : r.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function Ranking({ data }) {
  if (!data) return <Skeleton />
  if (data.total === 0) return <p className="rounded-2xl border border-line bg-surface p-4 text-sm">El ranking arranca cuando termine el primer partido con predicciones.</p>
  return (
    <div className="space-y-3">
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {data.top.map((e) => (
          <div key={e.userId} className={'flex items-center gap-3 px-3 py-3 ' + (e.isMe ? 'bg-accent-soft' : '')}>
            <span className="w-7 text-center text-sm font-extrabold tabular-nums">{e.position}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{e.name}{e.isMe ? ' (vos)' : ''}</span>
            <span className="text-xs text-muted">{e.hits}/{e.played}</span>
            <span className="w-14 text-right text-sm font-extrabold tabular-nums">{e.points} pts</span>
          </div>
        ))}
      </div>
      {data.me && data.me.position > data.top.length && <p className="text-center text-sm">Estás en el puesto {data.me.position} con {data.me.points} pts.</p>}
    </div>
  )
}

// Prode: predicciones con puntos (sin dinero). Mis aciertos y el ranking general.
export default function ProdePage() {
  const [tab, setTab] = useState('mine')
  const [mine, setMine] = useState(null)
  const [rank, setRank] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    api('GET', '/predictions/me').then(setMine).catch((e) => setErr(e.message))
    api('GET', '/predictions/ranking').then(setRank).catch((e) => setErr(e.message))
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Prode</h1>
      <p className="text-sm text-muted">Predecí quién gana cada partido antes de que empiece. Cada acierto suma puntos. Es un juego, no hay dinero.</p>
      <div className="flex gap-2">
        {[['mine', 'Mis predicciones'], ['rank', 'Ranking']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={'rounded-full border px-4 py-2 text-sm font-bold ' + (tab === k ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}>{l}</button>
        ))}
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}
      {tab === 'mine' ? <Mine data={mine} /> : <Ranking data={rank} />}
    </div>
  )
}
