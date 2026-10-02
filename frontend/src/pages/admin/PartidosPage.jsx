import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, RotateCcw } from 'lucide-react'
import { api } from '../../lib/api'
import { STATUS, fmtWhen } from '../../lib/format'
import { Btn, Alert, inputCls } from '../../components/ui'
import MatchForm from '../../components/MatchForm'
import StatusPill from '../../components/StatusPill'
import Versus from '../../components/Versus'

// Solo se puede ocultar un partido que no esté en curso
const canHide = (status) => status === 'SCHEDULED' || status === 'FINISHED' || status === 'CANCELLED'

function MatchRow({ m, hidden, busy, onHide, onRestore, onPurge }) {
  return (
    <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <StatusPill status={m.status} />
        <span className="text-sm text-muted">Cancha {m.court}</span>
      </div>
      <Link to={'/admin/partidos/' + m.id} className="block">
        <Versus a={m.teamA} b={m.teamB} />
      </Link>
      <p className="text-center text-sm text-muted">{fmtWhen(m.scheduledAt)}</p>

      {!hidden && canHide(m.status) && (
        <Btn tone="danger" disabled={busy} onClick={onHide} className="w-full">
          <Trash2 size={16} /> Eliminar
        </Btn>
      )}
      {hidden && (
        <div className="grid grid-cols-2 gap-2">
          <Btn disabled={busy} onClick={onRestore}><RotateCcw size={16} /> Restaurar</Btn>
          <Btn tone="danger" disabled={busy} onClick={onPurge}><Trash2 size={16} /> Eliminar definitivo</Btn>
        </div>
      )}
    </div>
  )
}

export default function PartidosPage() {
  const [matches, setMatches] = useState(null)
  const [tournaments, setTournaments] = useState(null)
  const [teams, setTeams] = useState(null)
  const [status, setStatus] = useState('')
  const [view, setView] = useState('active') // 'active' | 'hidden'
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [err, setErr] = useState('')

  const load = () => {
    const p = new URLSearchParams({ limit: '200' })
    if (status) p.set('status', status)
    if (view === 'hidden') p.set('hidden', 'true')
    return api('GET', '/matches?' + p).then(setMatches).catch((e) => setErr(e.message))
  }
  useEffect(() => { load() }, [status, view])
  useEffect(() => {
    api('GET', '/tournaments').then(setTournaments).catch((e) => setErr(e.message))
    api('GET', '/teams').then(setTeams).catch((e) => setErr(e.message))
  }, [])

  async function create(body) {
    setBusyId('new'); setErr('')
    try {
      await api('POST', '/matches', body)
      setOpen(false)
      await load()
    } catch (e) { setErr(e.errors?.join(' · ') || e.data?.errors?.join(' · ') || e.message) } finally { setBusyId(null) }
  }

  async function hide(m) {
    const name = (m.teamA?.name ?? '—') + ' vs ' + (m.teamB?.name ?? '—')
    if (!confirm('¿Eliminar ' + name + '? Podés restaurarlo después desde "Eliminados".')) return
    setBusyId(m.id); setErr('')
    try {
      await api('POST', '/matches/' + m.id + '/hide')
      setMatches((prev) => (prev ?? []).filter((x) => x.id !== m.id))
    } catch (e) { setErr(e.message) } finally { setBusyId(null) }
  }

  async function restore(m) {
    setBusyId(m.id); setErr('')
    try {
      await api('POST', '/matches/' + m.id + '/restore')
      setMatches((prev) => (prev ?? []).filter((x) => x.id !== m.id))
    } catch (e) { setErr(e.message) } finally { setBusyId(null) }
  }

  async function purge(m) {
    const name = (m.teamA?.name ?? '—') + ' vs ' + (m.teamB?.name ?? '—')
    if (!confirm('Esto borra "' + name + '" para siempre y no se puede deshacer. ¿Eliminar definitivamente?')) return
    setBusyId(m.id); setErr('')
    try {
      await api('DELETE', '/matches/' + m.id + '/purge')
      setMatches((prev) => (prev ?? []).filter((x) => x.id !== m.id))
    } catch (e) { setErr(e.message) } finally { setBusyId(null) }
  }

  const ready = tournaments && teams

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Partidos</h1>
        {view === 'active' && (
          <Btn tone="accent" onClick={() => setOpen((o) => !o)} className="px-4 py-2"><Plus size={16} /> Nuevo</Btn>
        )}
      </div>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}

      {open && view === 'active' && ready && (
        <div className="rounded-3xl border border-line bg-surface p-5">
          {tournaments.length === 0
            ? <p className="text-sm text-muted">Primero creá un torneo.</p>
            : <MatchForm tournaments={tournaments} teams={teams} onSubmit={create} label="Crear partido" busy={busyId === 'new'} />}
        </div>
      )}

      <div className="flex gap-2">
        <Btn tone={view === 'active' ? 'accent' : 'base'} onClick={() => setView('active')} className="flex-1">Partidos</Btn>
        <Btn tone={view === 'hidden' ? 'accent' : 'base'} onClick={() => setView('hidden')} className="flex-1">Eliminados</Btn>
      </div>

      <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">Todos los estados</option>
        {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
      </select>

      {matches === null && <p className="text-muted">Cargando…</p>}
      {matches && matches.length === 0 && (
        <p className="text-muted">{view === 'hidden' ? 'No hay partidos eliminados.' : 'No hay partidos.'}</p>
      )}
      <div className="space-y-3">
        {(matches ?? []).map((m) => (
          <MatchRow
            key={m.id}
            m={m}
            hidden={view === 'hidden'}
            busy={busyId === m.id}
            onHide={() => hide(m)}
            onRestore={() => restore(m)}
            onPurge={() => purge(m)}
          />
        ))}
      </div>
    </div>
  )
}
