import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { api } from '../../lib/api'
import { BRANCH, MODALITY, normMatch } from '../../lib/format'
import MatchCard from '../MatchCard'
import Forma from '../torneo/Forma'
import { Skeleton } from '../ui'

// Mismos colores que la tabla del torneo: ascenso (verde), descenso (rojo), playoff de ascenso/permanencia (naranja)
const ZONE_CLS = { PROMOTION: 'bg-live/10', RELEGATION: 'bg-danger/10', PLAYOFF: 'bg-warn/10' }
const ZONE_POS = { PROMOTION: 'bg-live text-black', RELEGATION: 'bg-danger text-white', PLAYOFF: 'bg-warn text-black' }

const WINDOW = 6 // si la zona es más grande, se muestran los equipos cercanos al propio

function Tabla({ rows, teamId, zone }) {
  const mine = rows.findIndex((r) => r.team.id === teamId)
  let view = rows
  if (rows.length > WINDOW && mine >= 0) {
    const start = Math.max(0, Math.min(mine - 2, rows.length - WINDOW))
    view = rows.slice(start, start + WINDOW)
  }
  return (
    <>
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[11px] uppercase tracking-widest text-muted">
          <th className="w-8 py-1 text-left">#</th>
          <th className="py-1 text-left">Equipo</th>
          <th className="w-9 py-1 text-center">J</th>
          <th className="w-9 py-1 text-center">DP</th>
          <th className="w-10 py-1 text-center">Pts</th>
          <th className="py-1 pl-2 text-right">Últimas</th>
        </tr>
      </thead>
      <tbody>
        {view.map((r) => {
          const me = r.team.id === teamId
          return (
            <tr key={r.team.id} className={(ZONE_CLS[r.zone] ?? '') + (me ? ' font-extrabold ring-1 ring-inset ring-accent' : '')}>
              <td className="py-1.5 pl-1"><span className={'grid h-6 w-6 place-items-center rounded-full text-xs font-extrabold tabular-nums ' + (ZONE_POS[r.zone] ?? '')}>{rows.indexOf(r) + 1}</span></td>
              <td className="max-w-0 truncate py-1.5">{r.team.name}</td>
              <td className="py-1.5 text-center tabular-nums">{r.played}</td>
              <td className="py-1.5 text-center tabular-nums">{r.pointDiff > 0 ? '+' + r.pointDiff : r.pointDiff}</td>
              <td className="py-1.5 text-center font-mono tabular-nums">{r.points}</td>
              <td className="py-1.5 pl-2 text-right"><Forma form={r.form} size="sm" /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
    {zone && (zone.promotions > 0 || zone.relegations > 0 || zone.playoffPositions?.length > 0) && (
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 text-[11px] font-bold">
        {zone.promotions > 0 && <span className="flex items-center gap-1.5 text-live"><span className="h-2.5 w-2.5 rounded-sm bg-live" /> {zone.promotions === 1 ? 'Asciende' : 'Ascienden ' + zone.promotions}</span>}
        {zone.relegations > 0 && <span className="flex items-center gap-1.5 text-danger"><span className="h-2.5 w-2.5 rounded-sm bg-danger" /> {zone.relegations === 1 ? 'Desciende' : 'Descienden ' + zone.relegations}</span>}
        {zone.playoffPositions?.length > 0 && <span className="flex items-center gap-1.5 text-warn"><span className="h-2.5 w-2.5 rounded-sm bg-warn" /> Playoff de ascenso/permanencia</span>}
      </div>
    )}
    </>
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
  const mine = it.rows.find((r) => r.team.id === teamId)
  const place = !text && t.status === 'FINISHED' && mine ? 'Terminó ' + mine.position + '.º en la tabla' + (it.zone ? ' · ' + it.zone.name : '') : null
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
          {it.rows.length > 0 ? <Tabla rows={it.rows} teamId={teamId} zone={it.zone} /> : <p className="text-sm text-muted">Este torneo no tiene tabla de posiciones.</p>}
          {place && <p className="text-center text-sm font-bold">{place}</p>}
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
