import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, Trophy } from 'lucide-react'
import BackLink from '../components/BackLink'
import { api } from '../lib/api'
import { BRANCH, MODALITY, FORMAT, TSTATUS } from '../lib/format'
import StandingsView from '../components/torneo/StandingsView'
import BracketView from '../components/torneo/BracketView'
import FixtureView from '../components/torneo/FixtureView'
import ExtraMatchesView from '../components/torneo/ExtraMatchesView'
import { socket } from '../sockets/socket'

// Detalle público de un torneo: tabla, fixture y llaves
export default function TorneoPage() {
  const { id } = useParams()
  const [t, setT] = useState(null)
  const [tab, setTab] = useState('')
  const [err, setErr] = useState('')
  const [extra, setExtra] = useState(0) // partidos fuera del fixture: la pestaña aparece solo si hay

  useEffect(() => {
    api('GET', '/tournaments/' + id).then((d) => {
      setT(d)
      const hasLeague = d.stages.some((s) => s.type === 'LEAGUE')
      setTab(hasLeague ? 'tabla' : 'llave')
    }).catch((e) => setErr(e.message))
  }, [id])

  // Cantidad de partidos fuera del fixture; se refresca cuando cambia algún partido
  useEffect(() => {
    let timer
    const load = () => api('GET', '/tournaments/' + id + '/extra-matches').then((l) => setExtra(l.length)).catch(() => {})
    const onUpdated = () => { clearTimeout(timer); timer = setTimeout(load, 1200) }
    load()
    socket.emit('matches:subscribe')
    // Pausa o reanudación del torneo: se vuelve a pedir (a quien no es organización le sale "no encontrado" mientras está pausado)
    const onTour = (p) => {
      if (p.tournamentId !== id) return
      api('GET', '/tournaments/' + id).then((d) => { setErr(''); setT(d); load() }).catch((e) => setErr(e.message))
    }
    socket.on('match:updated', onUpdated)
    socket.on('tournament:updated', onTour)
    return () => { clearTimeout(timer); socket.off('match:updated', onUpdated); socket.off('tournament:updated', onTour); socket.emit('matches:unsubscribe') }
  }, [id])

  if (err) return <p className="text-danger">{err}</p>
  if (!t) return <p className="text-muted">Cargando…</p>

  const st = TSTATUS[t.status]
  const tabs = [
    ...(t.stages.some((s) => s.type === 'LEAGUE') ? [['tabla', 'Tabla'], ['fixture', 'Fixture']] : []),
    ...(t.stages.some((s) => s.type === 'KNOCKOUT') ? [['llave', 'Playoffs']] : []),
    ...(extra > 0 ? [['extra', 'Fuera del fixture']] : []),
  ]
  const knockouts = t.stages.filter((s) => s.type === 'KNOCKOUT')

  return (
    <div className="space-y-4">
      <BackLink to="/liga" className="flex items-center gap-1 text-sm text-muted"><ArrowLeft size={16} /> Liga o copas</BackLink>
      <div>
        <h1 className="text-xl font-extrabold">{t.name}{t.edition ? ' · ' + t.edition : ''}</h1>
        <p className="text-sm text-muted">{t.year} · {FORMAT[t.format]} · {BRANCH[t.branch]} · {MODALITY[t.modality]}</p>
        <p className="mt-1 flex items-center gap-2">
          <span className={'rounded-full px-2 py-0.5 text-xs font-bold uppercase ' + st.cls}>{st.label}</span>
          {t.champion && <span className="flex items-center gap-1 text-sm font-bold"><Trophy size={14} /> Campeón: {t.champion.name}</span>}
        </p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={'shrink-0 rounded-full px-4 py-2 text-sm font-bold ' + (tab === k ? 'bg-accent text-black' : 'border border-line bg-surface')}>{label}</button>
        ))}
      </div>
      {tab === 'tabla' && <StandingsView tournamentId={t.id} finished={t.status === 'FINISHED'} />}
      {tab === 'fixture' && <FixtureView tournamentId={t.id} />}
      {tab === 'extra' && <ExtraMatchesView tournamentId={t.id} />}
      {tab === 'llave' && knockouts.map((s) => (
        <div key={s.id} className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">{s.name}</p>
          <BracketView tournamentId={t.id} stageId={s.id} />
        </div>
      ))}
    </div>
  )
}
