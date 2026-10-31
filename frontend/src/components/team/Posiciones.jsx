import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { api } from '../../lib/api'
import { BRANCH, MODALITY, normMatch } from '../../lib/format'
import MatchCard from '../MatchCard'
import Forma from '../torneo/Forma'
import { Skeleton } from '../ui'

const WINDOW = 6 // si la zona es más grande, se muestran los equipos cercanos al propio

function Tabla({ rows, teamId }) {
  const mine = rows.findIndex((r) => r.team.id === teamId)
  let view = rows
  if (rows.length > WINDOW && mine >= 0) {
    const start = Math.max(0, Math.min(mine - 2, rows.length - WINDOW))
    view = rows.slice(start, start + WINDOW)
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-widest text-muted">
          <th className="w-8 py-1 text-left">#</th>
          <th className="py-1 text-left">Equipo</th>
          <th className="w-9 py-1 text-center">PJ</th>
          <th className="w-9 py-1 text-center">DS</th>
          <th className="w-10 py-1 text-center">Pts</th>
          <th className="py-1 pl-2 text-right">Últimas</th>
        </tr>
      </thead>
      <tbody>
        {view.map((r) => {
          const me = r.team.id === teamId
          return (
            <tr key={r.team.id} className={me ? 'bg-accent/15 font-extrabold' : ''}>
              <td className="py-1.5 pl-1 tabular-nums">{rows.indexOf(r) + 1}</td>
              <td className="max-w-0 truncate py-1.5">{r.team.name}</td>
              <td className="py-1.5 text-center tabular-nums">{r.played}</td>
              <td className="py-1.5 text-center tabular-nums">{r.setDiff > 0 ? '+' + r.setDiff : r.setDiff}</td>
              <td className="py-1.5 text-center font-mono tabular-nums">{r.points}</td>
              <td className="py-1.5 pl-2 text-right"><Forma form={r.form} size="sm" /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function playoffText(q) {
  if (!q) return null
  if (q.done) return q.inSpot ? 'Clasificó a playoffs como ' + q.position + '° ' + q.zoneName : 'No clasificó a playoffs'
  return q.inSpot
    ? 'Hoy clasifica a playoffs como ' + q.position + '° ' + q.zoneName
    : 'Juega playoffs si termina entre 1° y ' + q.maxSpot + '° (hoy es ' + q.position + '°)'
}

function Card({ it, teamId, open, onToggle }) {
  const t = it.tournament
  const text = playoffText(it.qualification)
  return (
    <div className="rounded-3xl border border-line bg-surface">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{t.name}{t.edition ? ' · ' + t.edition : ''}</p>
          <p className="text-xs text-muted">{BRANCH[t.branch]} · {MODALITY[t.modality]}{it.zone ? ' · ' + it.zone.name : ''}</p>
        </div>
        <span className={'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold uppercase ' + (t.status === 'ACTIVE' ? 'bg-live/15 text-live' : 'bg-surface-2 text-muted')}>
          {t.status === 'ACTIVE' ? 'En curso' : 'Finalizado'}
        </span>
        <ChevronDown size={18} className={'shrink-0 text-muted transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          {it.rows.length > 0 ? <Tabla rows={it.rows} teamId={teamId} /> : <p className="text-sm text-muted">Este torneo no tiene tabla de posiciones.</p>}
          <Link to={'/liga/' + t.id} className="block text-center text-sm font-bold text-accent">Ver torneo completo ›</Link>
          {(text || it.playoffs.length > 0) && (
            <div className="space-y-3 border-t border-line pt-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted">Playoffs</p>
              {text && <p className="text-sm font-semibold">{text}</p>}
              {it.playoffs.map((m) => <MatchCard key={m.id} m={normMatch(m)} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Posiciones del equipo: solo la tabla de SU zona en cada torneo que disputa (filtrado por rama y modalidad)
export default function Posiciones({ teamId, mod, br }) {
  const [list, setList] = useState(null)
  const [openIds, setOpenIds] = useState(null)

  useEffect(() => {
    setList(null)
    api('GET', '/teams/' + teamId + '/posiciones').then(setList).catch(() => setList([]))
  }, [teamId])

  if (list === null) return <Skeleton />
  const shown = list.filter((it) => (mod === 'all' || it.tournament.modality === mod) && (br === 'all' || it.tournament.branch === br))
  if (!shown.length) return <p className="text-muted">No juega torneos con tabla de posiciones en esta categoría.</p>

  // Todas las tablas arrancan cerradas; se abre la que se toca
  const isOpen = (it) => (openIds ? openIds.includes(it.tournament.id) : false)
  const toggle = (it) => setOpenIds((cur) => {
    const base = cur ?? shown.filter((x) => isOpen(x)).map((x) => x.tournament.id)
    return base.includes(it.tournament.id) ? base.filter((x) => x !== it.tournament.id) : [...base, it.tournament.id]
  })

  return (
    <div className="space-y-3">
      {shown.map((it) => <Card key={it.tournament.id} it={it} teamId={teamId} open={isOpen(it)} onToggle={() => toggle(it)} />)}
    </div>
  )
}
