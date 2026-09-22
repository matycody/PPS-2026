import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '../../lib/api'
import { STATUS } from '../../lib/format'
import { Btn, Alert, inputCls } from '../../components/ui'
import MatchForm from '../../components/MatchForm'
import MatchCard from '../../components/MatchCard'

export default function PartidosPage() {
  const [matches, setMatches] = useState(null)
  const [tournaments, setTournaments] = useState(null)
  const [teams, setTeams] = useState(null)
  const [status, setStatus] = useState('')
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = () => api('GET', '/matches?limit=200').then(setMatches).catch((e) => setErr(e.message))
  useEffect(() => {
    load()
    api('GET', '/tournaments').then(setTournaments).catch((e) => setErr(e.message))
    api('GET', '/teams').then(setTeams).catch((e) => setErr(e.message))
  }, [])

  async function create(body) {
    setBusy(true); setErr('')
    try {
      await api('POST', '/matches', body)
      setOpen(false)
      await load()
    } catch (e) { setErr(e.errors?.join(' · ') || e.data?.errors?.join(' · ') || e.message) } finally { setBusy(false) }
  }

  const list = (matches ?? []).filter((m) => !status || m.status === status)
  const ready = tournaments && teams

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Partidos</h1>
        <Btn tone="accent" onClick={() => setOpen((o) => !o)} className="px-4 py-2"><Plus size={16} /> Nuevo</Btn>
      </div>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}

      {open && ready && (
        <div className="rounded-3xl border border-line bg-surface p-5">
          {tournaments.length === 0
            ? <p className="text-sm text-muted">Primero creá un torneo.</p>
            : <MatchForm tournaments={tournaments} teams={teams} onSubmit={create} label="Crear partido" busy={busy} />}
        </div>
      )}

      <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">Todos los estados</option>
        {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
      </select>

      {matches === null && <p className="text-muted">Cargando…</p>}
      {matches && list.length === 0 && <p className="text-muted">No hay partidos.</p>}
      <div className="space-y-2">
        {list.map((m) => (
          <MatchCard key={m.id} m={m} to={'/admin/partidos/' + m.id} />
        ))}
      </div>
    </div>
  )
}

