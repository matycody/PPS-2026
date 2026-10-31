import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { Link } from 'react-router-dom'
import TeamBadge from '../TeamBadge'
import Forma from './Forma'
import { socket } from '../../sockets/socket'

// Lugares de ascenso (verde) y descenso (rojo): se marcan para todos los usuarios
const ZONE_CLS = {
  PROMOTION: 'border-l-4 border-l-live bg-live/15',
  RELEGATION: 'border-l-4 border-l-danger bg-danger/15',
}
const ZONE_POS = { PROMOTION: 'bg-live text-black', RELEGATION: 'bg-danger text-white' }

// Tabla en vivo (calculada) o congelada, según el estado del torneo
export default function StandingsView({ tournamentId, finished, branch = null }) {
  const [stages, setStages] = useState(null)
  const [err, setErr] = useState('')
  const [tick, setTick] = useState(0) // sube cuando cambia un partido: la tabla en vivo se recalcula sola

  useEffect(() => {
    let alive = true
    if (tick === 0) setStages(null) // al refrescar no se vuelve a mostrar "Cargando…"
    const req = finished
      ? Promise.all([
          api('GET', '/tournaments/' + tournamentId + '/final-standings'),
          api('GET', '/tournaments/' + tournamentId + '/standings').catch(() => null), // solo para "Últimas"
        ]).then(([d, live]) => {
          const formOf = new Map((live?.stages ?? []).flatMap((z) => z.rows.map((r) => [r.team.id, r.form])))
          return d.stages.map((s) => ({
            ...s,
            rows: s.standings.map((r) => ({ ...r, setDiff: r.setsFor - r.setsAgainst, form: formOf.get(r.team.id) })),
          }))
        })
      : api('GET', '/tournaments/' + tournamentId + '/standings').then((d) => d.stages)
    req.then((s) => alive && setStages(s)).catch((e) => alive && setErr(e.message))
    return () => { alive = false }
  }, [tournamentId, finished, tick])

  // Con el torneo en curso, un partido que cambia (por ejemplo uno que termina) actualiza la tabla
  useEffect(() => {
    if (finished) return undefined
    let timer
    const onUpdated = () => { clearTimeout(timer); timer = setTimeout(() => setTick((x) => x + 1), 1200) }
    socket.emit('matches:subscribe')
    socket.on('match:updated', onUpdated)
    return () => { clearTimeout(timer); socket.off('match:updated', onUpdated); socket.emit('matches:unsubscribe') }
  }, [tournamentId, finished])

  if (err) return <p className="text-danger">{err}</p>
  if (!stages) return <p className="text-muted">Cargando…</p>
  if (!stages.length) return <p className="text-muted">Este torneo no tiene zonas de liga.</p>

  return (
    <div className="space-y-5">
      {stages.map((s) => (
        <div key={s.id} className="overflow-hidden rounded-3xl border border-line bg-surface">
          <p className="px-4 pt-4 text-xs font-bold uppercase tracking-widest text-muted">
            {s.name}
            {s.promotions > 0 && <span className="ml-2 text-live">↑ {s.promotions}</span>}
            {s.relegations > 0 && <span className="ml-2 text-danger">↓ {s.relegations}</span>}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Equipo</th>
                  <th className="px-2 py-2">PJ</th>
                  <th className="px-2 py-2">G</th>
                  <th className="px-2 py-2">E</th>
                  <th className="px-2 py-2">P</th>
                  <th className="px-2 py-2">DS</th>
                  <th className="px-3 py-2 font-extrabold text-fg">Pts</th>
                  <th className="px-2 py-2">Últimas</th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r, i) => (
                  <tr key={r.team.id} className={'border-t border-line text-center ' + (ZONE_CLS[r.zone] ?? 'border-l-4 border-l-transparent')}>
                    <td className={'px-3 py-2 text-left font-extrabold ' + (ZONE_POS[r.zone] ?? '')}>{i + 1}</td>
                    <td className="px-2 py-2 text-left">
                      <Link to={'/equipo/' + r.team.id} className="flex items-center gap-2">
                        <TeamBadge team={r.team} size="sm" branch={branch} />
                        <span className="truncate font-semibold">{r.team.name}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-2">{r.played}</td>
                    <td className="px-2 py-2">{r.won}</td>
                    <td className="px-2 py-2">{r.drawn}</td>
                    <td className="px-2 py-2">{r.lost}</td>
                    <td className="px-2 py-2">{r.setDiff > 0 ? '+' + r.setDiff : r.setDiff}</td>
                    <td className="px-3 py-2 font-extrabold">{r.points}</td>
                    <td className="px-2 py-2"><Forma form={r.form} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(s.promotions > 0 || s.relegations > 0) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-3 py-2 text-xs text-muted">
              {s.promotions > 0 && <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-live" />Ascenso</span>}
              {s.relegations > 0 && <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-danger" />Descenso</span>}
            </div>
          )}
          {(s.promotions > 0 || s.relegations > 0) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-2 text-[11px] font-bold">
              {s.promotions > 0 && <span className="flex items-center gap-1.5 text-live"><span className="h-2.5 w-2.5 rounded-sm bg-live" /> {s.promotions === 1 ? 'Asciende' : 'Ascienden ' + s.promotions}</span>}
              {s.relegations > 0 && <span className="flex items-center gap-1.5 text-danger"><span className="h-2.5 w-2.5 rounded-sm bg-danger" /> {s.relegations === 1 ? 'Desciende' : 'Descienden ' + s.relegations}</span>}
            </div>
          )}
          <p className="px-4 pb-3 pt-2 text-[11px] text-muted">
            PJ jugados · G ganados · E empatados · P perdidos · DS diferencia de sets · Últimas: V ganó, E empató, D perdió
          </p>
        </div>
      ))}
    </div>
  )
}
