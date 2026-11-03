import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Gavel } from 'lucide-react'
import BackLink from '../components/BackLink'
import { api } from '../lib/api'
import { BRANCH, MODALITY, PENALTY_KIND, penaltyWhy, catLabel } from '../lib/format'
import { Alert } from '../components/ui'

const fmt = (d) => new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const left = (s) => [s.sameDayLeft && 'resto de la jornada', s.remaining > 0 && s.remaining + (s.remaining === 1 ? ' fecha' : ' fechas')].filter(Boolean).join(' + ')
const scope = (s) => (s.categories?.length ? s.categories.map(catLabel).join(', ') : s.scope === 'ALL' ? 'todas las modalidades' : MODALITY[s.modality] ?? '')

// Sanciones vigentes (solo lectura) para cualquier persona con sesión
export default function SancionesPublicaPage() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('players')
  useEffect(() => { api('GET', '/sanciones-publicas').then(setD).catch((e) => setErr(e.message)) }, [])

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink to="/" className="flex items-center gap-1 text-sm text-muted"><ArrowLeft size={16} /> Volver</BackLink>
      <h1 className="flex items-center gap-2 text-xl font-extrabold"><Gavel size={20} /> Sanciones</h1>
      <div className="flex gap-2">
        {[['players', 'Jugadores', d?.suspensions.length], ['teams', 'Equipos', d?.teamPenalties.length]].map(([k, l, n]) => (
          <button key={k} onClick={() => setTab(k)} className={'rounded-full px-4 py-2 text-sm font-bold ' + (tab === k ? 'bg-accent text-black' : 'border border-line bg-surface')}>{l}{n != null ? ' · ' + n : ''}</button>
        ))}
      </div>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {!d && !err && <p className="text-sm text-muted">Cargando…</p>}
      {d && tab === 'players' && (
        <div className="space-y-3">
          {!d.suspensions.length && <div className="rounded-3xl border border-line bg-surface p-6 text-center text-sm text-muted">No hay jugadores suspendidos ahora.</div>}
          {d.suspensions.map((s) => (
            <div key={s.id} className="space-y-1 rounded-3xl border border-line bg-surface p-4">
              <p className="font-extrabold leading-tight">{s.player.name}{s.player.number != null ? ' #' + s.player.number : ''}</p>
              {s.teams.length > 0 && <p className="text-xs text-muted">{s.teams.join(' · ')}</p>}
              <p className="text-sm font-bold text-danger">Le falta: {left(s)}{scope(s) ? ' · ' + scope(s) : ''}</p>
              {s.reason && <p className="text-sm">“{s.reason}”</p>}
              <p className="text-xs text-muted">
                {s.origin.match ? s.origin.match + (s.origin.tournament ? ' · ' + s.origin.tournament : '') : 'Sanción ' + (s.origin.tournament ? 'del torneo ' + s.origin.tournament : 'general')} · {fmt(s.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
      {d && tab === 'teams' && (
        <div className="space-y-3">
          {!d.teamPenalties.length && <div className="rounded-3xl border border-line bg-surface p-6 text-center text-sm text-muted">No hay sanciones a equipos.</div>}
          {d.teamPenalties.map((x) => (
            <div key={x.id} className="space-y-1 rounded-3xl border border-line bg-surface p-4">
              <p className="font-extrabold leading-tight"><span className="text-danger">−{x.points} pt{x.points === 1 ? '' : 's'}</span> <Link to={'/equipo/' + x.team.id} className="underline">{x.team.name}</Link></p>
              <p className="text-sm">{penaltyWhy(x) || PENALTY_KIND[x.kind]}{x.reason && (x.kind === 'STAFF' || x.missing?.length) ? ' · ' + x.reason : ''}</p>
              <p className="text-xs text-muted">{x.tournament.name}{x.tournament.edition ? ' · ' + x.tournament.edition : ''} · {[MODALITY[x.tournament.modality], BRANCH[x.tournament.branch]].filter(Boolean).join(' ')} · {x.stage.name}{x.stage.tier ? ' · Cat. ' + String.fromCharCode(64 + x.stage.tier) : ''} · {fmt(x.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
