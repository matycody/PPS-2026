import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, X } from 'lucide-react'
import { api } from '../../lib/api'
import { Btn, Alert, inputCls } from '../../components/ui'
import MatchForm from '../../components/MatchForm'
import StatusPill from '../../components/StatusPill'

const FN = { REFEREE: 'Árbitro', TABLE: 'Mesa' }

export default function AdminMatchPage() {
  const { id } = useParams()
  const [m, setM] = useState(null)
  const [tournaments, setTournaments] = useState(null)
  const [teams, setTeams] = useState(null)
  const [referees, setReferees] = useState([])
  const [users, setUsers] = useState([])
  const [refPick, setRefPick] = useState('')
  const [tablePick, setTablePick] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api('GET', '/matches/' + id).then(setM).catch((e) => setErr(e.message))
  useEffect(() => {
    load()
    api('GET', '/tournaments').then(setTournaments).catch(() => {})
    api('GET', '/teams').then(setTeams).catch(() => {})
    api('GET', '/profiles?active=true').then((l) => setReferees(l.filter((p) => p.isReferee))).catch(() => {})
    api('GET', '/users?active=true').then(setUsers).catch(() => {})
  }, [id])

  async function run(fn, msg) {
    setBusy(true); setErr(''); setOk('')
    try { await fn(); await load(); if (msg) setOk(msg) } catch (e) { setErr(e.data?.errors?.join(' · ') || e.message) } finally { setBusy(false) }
  }

  if (!m || !tournaments || !teams) return <p className="mt-10 text-center text-muted">{err || 'Cargando…'}</p>

  const editable = m.status === 'SCHEDULED' || m.status === 'READY'
  const assignments = m.assignments ?? []
  const label = (a) => a.profile?.name ?? a.user?.email ?? a.profileId ?? a.userId ?? '—'

  return (
    <div className="space-y-4">
      <Link to="/admin/partidos" className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft size={16} /> Partidos
      </Link>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {ok && <Alert tone="ok" onClose={() => setOk('')}>{ok}</Alert>}

      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-lg font-extrabold">
          {m.teamA?.name ?? 'Por definir'} <span className="font-normal text-muted">vs</span> {m.teamB?.name ?? 'Por definir'}
        </p>
        <StatusPill status={m.status} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link to={'/partido/' + id} className="rounded-2xl border border-line bg-surface-2 py-3 text-center text-sm font-extrabold">Ver en vivo</Link>
        <Link to={'/control/' + id} className="rounded-2xl border border-line bg-surface-2 py-3 text-center text-sm font-extrabold">Control</Link>
        {m.status === 'SCHEDULED' && <Btn tone="accent" disabled={busy} onClick={() => run(() => api('POST', '/matches/' + id + '/ready'), 'Partido habilitado')}>Habilitar</Btn>}
        {m.status === 'READY' && <Btn disabled={busy} onClick={() => run(() => api('POST', '/matches/' + id + '/unready'), 'Habilitación revertida')}>Revertir habilitación</Btn>}
        {m.status !== 'FINISHED' && m.status !== 'CANCELLED' && (
          <Btn tone="danger" disabled={busy} onClick={() => confirm('¿Cancelar el partido?') && run(() => api('POST', '/matches/' + id + '/cancel'), 'Partido cancelado')}>Cancelar partido</Btn>
        )}
      </div>

      <section className="rounded-3xl border border-line bg-surface p-5">
        <p className="mb-3 text-sm font-bold">Datos del partido</p>
        {editable ? (
          <MatchForm
            key={m.status + m.scheduledAt + m.teamA?.id + m.teamB?.id}
            initial={m}
            tournaments={tournaments}
            teams={teams}
            busy={busy}
            label="Guardar cambios"
            onSubmit={(body) => run(() => api('PATCH', '/matches/' + id, body), 'Cambios guardados')}
          />
        ) : (
          <p className="text-sm text-muted">Solo se edita con el partido Programado o Habilitado.</p>
        )}
      </section>

      <section className="space-y-3 rounded-3xl border border-line bg-surface p-5">
        <p className="text-sm font-bold">Asignaciones</p>
        {assignments.length === 0 && <p className="text-sm text-muted">Sin asignaciones.</p>}
        {assignments.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <span className="w-14 shrink-0 text-[11px] font-bold uppercase text-accent">{FN[a.function] ?? a.function}</span>
            <span className="flex-1 truncate font-semibold">{label(a)}</span>
            <button aria-label="Quitar" disabled={busy} onClick={() => run(() => api('DELETE', '/matches/' + id + '/assignments/' + a.id))}>
              <X size={16} className="text-danger" />
            </button>
          </div>
        ))}

        <div className="flex gap-2">
          <select className={inputCls} value={refPick} onChange={(e) => setRefPick(e.target.value)}>
            <option value="">Árbitro…</option>
            {referees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Btn tone="accent" disabled={busy || !refPick} onClick={() => run(async () => { await api('POST', '/matches/' + id + '/assignments', { function: 'REFEREE', profileId: refPick }); setRefPick('') })}>Asignar</Btn>
        </div>
        <div className="flex gap-2">
          <select className={inputCls} value={tablePick} onChange={(e) => setTablePick(e.target.value)}>
            <option value="">Mesa (usuario)…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>
          <Btn tone="accent" disabled={busy || !tablePick} onClick={() => run(async () => { await api('POST', '/matches/' + id + '/assignments', { function: 'TABLE', userId: tablePick }); setTablePick('') })}>Asignar</Btn>
        </div>
      </section>
    </div>
  )
}
