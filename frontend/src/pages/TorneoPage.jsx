import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Trophy } from 'lucide-react'
import { api } from '../lib/api'
import { BRANCH, MODALITY, FORMAT, TSTATUS } from '../lib/format'
import StandingsView from '../components/torneo/StandingsView'
import BracketView from '../components/torneo/BracketView'
import FixtureView from '../components/torneo/FixtureView'

// Detalle público de un torneo: tabla, fixture y llaves
export default function TorneoPage() {
  const { id } = useParams()
  const [t, setT] = useState(null)
  const [tab, setTab] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    api('GET', '/tournaments/' + id).then((d) => {
      setT(d)
      const hasLeague = d.stages.some((s) => s.type === 'LEAGUE')
      setTab(hasLeague ? 'tabla' : 'llave')
    }).catch((e) => setErr(e.message))
  }, [id])

  if (err) return <p className="text-danger">{err}</p>
  if (!t) return <p className="text-muted">Cargando…</p>

  const st = TSTATUS[t.status]
  const tabs = [
    ...(t.stages.some((s) => s.type === 'LEAGUE') ? [['tabla', 'Tabla'], ['fixture', 'Fixture']] : []),
    ...(t.stages.some((s) => s.type === 'KNOCKOUT') ? [['llave', 'Llave']] : []),
  ]
  const knockouts = t.stages.filter((s) => s.type === 'KNOCKOUT')

  return (
    <div className="space-y-4">
      <Link to="/liga" className="flex items-center gap-1 text-sm text-muted"><ArrowLeft size={16} /> Liga o copas</Link>
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
      {tab === 'llave' && knockouts.map((s) => (
        <div key={s.id} className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">{s.name}</p>
          <BracketView tournamentId={t.id} stageId={s.id} />
        </div>
      ))}
    </div>
  )
}
