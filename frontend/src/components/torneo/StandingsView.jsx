import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import TeamBadge from '../TeamBadge'

const ZONE_CLS = {
  PROMOTION: 'border-l-4 border-l-live',
  RELEGATION: 'border-l-4 border-l-danger',
}

// Tabla en vivo (calculada) o congelada, según el estado del torneo
export default function StandingsView({ tournamentId, finished }) {
  const [stages, setStages] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    setStages(null)
    const req = finished
      ? api('GET', '/tournaments/' + tournamentId + '/final-standings').then((d) =>
          d.stages.map((s) => ({
            ...s,
            rows: s.standings.map((r) => ({ ...r, setDiff: r.setsFor - r.setsAgainst })),
          }))
        )
      : api('GET', '/tournaments/' + tournamentId + '/standings').then((d) => d.stages)
    req.then((s) => alive && setStages(s)).catch((e) => alive && setErr(e.message))
    return () => { alive = false }
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
            <table className="w-full min-w-[420px] text-sm">
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
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.team.id} className={'border-t border-line text-center ' + (ZONE_CLS[r.zone] ?? 'border-l-4 border-l-transparent')}>
                    <td className="px-3 py-2 text-left font-bold">{r.position}{r.tied ? '=' : ''}</td>
                    <td className="px-2 py-2 text-left">
                      <span className="flex items-center gap-2">
                        <TeamBadge team={r.team} size="sm" />
                        <span className="truncate font-semibold">{r.team.name}</span>
                      </span>
                    </td>
                    <td className="px-2 py-2">{r.played}</td>
                    <td className="px-2 py-2">{r.won}</td>
                    <td className="px-2 py-2">{r.drawn}</td>
                    <td className="px-2 py-2">{r.lost}</td>
                    <td className="px-2 py-2">{r.setDiff > 0 ? '+' + r.setDiff : r.setDiff}</td>
                    <td className="px-3 py-2 font-extrabold">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 pb-3 pt-2 text-[11px] text-muted">
            PJ jugados · G ganados · E empatados · P perdidos · DS diferencia de sets. “=” marca empate sin resolver.
          </p>
        </div>
      ))}
    </div>
  )
}
