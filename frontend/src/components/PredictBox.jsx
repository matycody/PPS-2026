import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'

const pct = (n, total) => (total ? Math.round((n / total) * 100) + '%' : '0%')

// Prode del partido: elegís quién gana (o empate) hasta que empiece. Sin dinero: cada acierto suma puntos al ranking.
// No aparece sin sesión ni para quien juega o está asignado a este partido (el backend lo informa en "blocked").
export default function PredictBox({ matchId, teamA, teamB }) {
  const user = useAuthStore((s) => s.user)
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!user || !matchId) return
    let live = true
    api('GET', '/predictions/match/' + matchId).then((r) => live && setD(r)).catch(() => live && setD(null))
    return () => { live = false }
  }, [user, matchId])

  if (!user || !d) return null
  if (!d.open && !d.pick && !d.votes.total) return null // ya empezó y nadie había predicho

  const choose = async (pick) => {
    if (!d.open || busy) return
    setBusy(true)
    setErr('')
    try {
      if (d.pick === pick) await api('DELETE', '/predictions/match/' + matchId)
      else await api('POST', '/predictions', { matchId, pick })
      setD(await api('GET', '/predictions/match/' + matchId))
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const opts = [
    { k: 'A', label: teamA?.name ?? 'Local' },
    { k: 'DRAW', label: 'Empate' },
    { k: 'B', label: teamB?.name ?? 'Visitante' },
  ]
  const verdict = d.result === 'HIT' ? 'Acertaste: +' + d.points + ' pts' : d.result === 'MISS' ? 'No acertaste' : d.result === 'VOID' ? 'Partido sin resultado: no suma ni resta' : null

  return (
    <div className="rounded-3xl border border-line bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted"><Trophy size={14} /> Prode</p>
        <Link to="/prode" className="text-xs font-bold text-accent">Mis puntos y ranking</Link>
      </div>

      {d.blocked ? (
        <p className="text-sm text-muted">{d.blocked}.</p>
      ) : (
        <>
          <p className="mb-3 text-sm">{d.open ? '¿Quién gana? Acertar suma ' + d.points + ' puntos. Podés cambiarlo hasta que empiece.' : 'La predicción está cerrada.'}</p>
          <div className="grid grid-cols-3 gap-2">
            {opts.map((o) => {
              const on = d.pick === o.k
              return (
                <button
                  key={o.k}
                  type="button"
                  disabled={!d.open || busy}
                  onClick={() => choose(o.k)}
                  aria-pressed={on}
                  className={'flex min-w-0 flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center disabled:opacity-60 ' + (on ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2')}
                >
                  <span className="w-full truncate text-xs font-extrabold">{o.label}</span>
                  <span className="text-[11px] font-bold text-muted">{pct(d.votes[o.k], d.votes.total)}</span>
                </button>
              )
            })}
          </div>
          {verdict && <p className={'mt-3 text-sm font-bold ' + (d.result === 'HIT' ? 'text-live' : 'text-muted')}>{verdict}</p>}
          {err && <p className="mt-2 text-sm text-danger">{err}</p>}
          <p className="mt-3 text-[11px] text-muted">{d.votes.total} {d.votes.total === 1 ? 'voto' : 'votos'} · es un juego de puntos, no hay dinero.</p>
        </>
      )}
    </div>
  )
}
