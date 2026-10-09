import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, RotateCcw, Check, ChevronDown } from 'lucide-react'
import { api } from '../../lib/api'
import { STATUS, fmtWhen, courtLabel } from '../../lib/format'
import { Btn, Alert, inputCls } from '../../components/ui'
import MatchForm from '../../components/MatchForm'
import StatusPill from '../../components/StatusPill'
import Versus from '../../components/Versus'
import { matchInfo } from '../../lib/matchInfo'
import { statusBorder } from '../../lib/statusStyle'
import { useConfirm } from '../../components/ConfirmProvider'

// Solo se puede ocultar un partido que no esté en curso
const canHide = (status) => status === 'SCHEDULED' || status === 'FINISHED' || status === 'CANCELLED'

function MatchRow({ m, hidden, busy, onHide, onRestore, onPurge, selecting, selected, onToggle }) {
  return (
    <div
      onClick={selecting ? onToggle : undefined}
      className={'space-y-3 rounded-3xl border bg-surface p-4 ' + (selecting ? 'cursor-pointer ' : '') + (selected ? 'border-accent ring-2 ring-accent/40' : statusBorder(m.status))}
    >
      <div className="flex items-center justify-between">
        <StatusPill status={m.status} />
        <span className="flex items-center gap-2 text-sm text-muted">
          {courtLabel(m.court)}
          {selecting && (
            <span className={'grid h-6 w-6 place-items-center rounded-md border-2 ' + (selected ? 'border-accent bg-accent text-black' : 'border-line')}>
              {selected && <Check size={16} />}
            </span>
          )}
        </span>
      </div>
      <Link to={'/admin/partidos/' + m.id} onClick={(e) => selecting && e.preventDefault()} className="block">
        <Versus a={m.teamA} b={m.teamB} />
      </Link>
      <p className="text-center text-xs font-bold uppercase tracking-wider text-muted">{matchInfo(m)}</p>
      <p className="text-center text-sm text-muted">{fmtWhen(m.scheduledAt)}</p>

      {!selecting && !hidden && canHide(m.status) && (
        <Btn tone="danger" disabled={busy} onClick={onHide} className="w-full">
          <Trash2 size={16} /> Eliminar
        </Btn>
      )}
      {!selecting && hidden && (
        <div className="grid grid-cols-2 gap-2">
          <Btn tone="accent" disabled={busy} onClick={onRestore}><RotateCcw size={16} /> Restaurar</Btn>
          <Btn tone="danger" disabled={busy} onClick={onPurge}><Trash2 size={16} /> Eliminar definitivo</Btn>
        </div>
      )}
    </div>
  )
}

export default function PartidosPage() {
  const ask = useConfirm()
  const [matches, setMatches] = useState(null)
  const [tournaments, setTournaments] = useState(null)
  const [teams, setTeams] = useState(null)
  const [status, setStatus] = useState('')
  const [view, setView] = useState('active') // 'active' | 'hidden'
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [ok, setOk] = useState('')
  const [menu, setMenu] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = () => {
    const p = new URLSearchParams({ limit: '200' })
    if (status) p.set('status', status)
    if (view === 'hidden') p.set('hidden', 'true')
    return api('GET', '/matches?' + p).then(setMatches).catch((e) => setErr(e.message))
  }
  useEffect(() => { load() }, [status, view])
  useEffect(() => { setSelecting(false); setSelected(new Set()); setMenu(false) }, [status, view])
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
    if (!(await ask({ title: 'Eliminar partido', message: '¿Eliminar ' + name + '? Podés restaurarlo después desde "Eliminados".', confirmText: 'Eliminar', danger: true }))) return
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
    if (!(await ask({ title: 'Eliminar definitivamente', message: 'Esto borra "' + name + '" para siempre y no se puede deshacer.', confirmText: 'Eliminar definitivo', danger: true }))) return
    setBusyId(m.id); setErr('')
    try {
      await api('DELETE', '/matches/' + m.id + '/purge')
      setMatches((prev) => (prev ?? []).filter((x) => x.id !== m.id))
    } catch (e) { setErr(e.message) } finally { setBusyId(null) }
  }

  // Acciones en lote sobre los partidos eliminados: restaurar o borrar definitivamente
  async function bulk(kind, list) {
    setBulkBusy(true); setErr(''); setOk('')
    const queue = list.map((x) => x.id)
    let done = 0
    let failed = 0
    let firstErr = ''
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift()
        try {
          if (kind === 'restore') await api('POST', '/matches/' + id + '/restore')
          else await api('DELETE', '/matches/' + id + '/purge')
          done++
        } catch (e) {
          failed++
          if (!firstErr) firstErr = e.message
        }
      }
    }
    await Promise.all([worker(), worker(), worker()])
    setSelected(new Set())
    setSelecting(false)
    await load()
    const what = kind === 'restore' ? 'restaurados' : 'eliminados definitivamente'
    if (failed) setErr(done + ' ' + what + ' y ' + failed + ' con error: ' + firstErr)
    else setOk(done + (done === 1 ? ' partido ' : ' partidos ') + what)
    setBulkBusy(false)
  }

  const askBulk = async (kind, list) => {
    const n = list.length
    if (!n) return
    const restore = kind === 'restore'
    const plural = n === 1 ? 'partido' : 'partidos'
    const okAsk = await ask({
      title: restore ? 'Restaurar partidos' : 'Eliminar definitivamente',
      message: restore
        ? 'Se restauran ' + n + ' ' + plural + '.'
        : 'Se borran para siempre ' + n + ' ' + plural + ' y no se puede deshacer.',
      confirmText: (restore ? 'Restaurar ' : 'Eliminar ') + n,
      danger: !restore,
    })
    if (okAsk) await bulk(kind, list)
  }

  const all = matches ?? []
  const chosen = all.filter((x) => selected.has(x.id))
  const toggle = (id) => setSelected((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const toggleAll = () => setSelected(selected.size === all.length ? new Set() : new Set(all.map((x) => x.id)))
  const cancelSelect = () => { setSelecting(false); setSelected(new Set()) }

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
      {ok && <Alert tone="ok" onClose={() => setOk('')}>{ok}</Alert>}

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

      {view === 'hidden' && all.length > 0 && !selecting && (
        <div className="relative">
          <Btn onClick={() => setMenu((v) => !v)} disabled={bulkBusy} className="w-full">
            Acciones sobre eliminados <ChevronDown size={16} />
          </Btn>
          {menu && <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />}
          {menu && (
            <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
              <button className="block w-full px-4 py-3 text-left text-sm font-bold text-danger" onClick={() => { setMenu(false); askBulk('purge', all) }}>
                Eliminar todos ({all.length})
              </button>
              <button className="block w-full border-t border-line px-4 py-3 text-left text-sm font-bold text-accent" onClick={() => { setMenu(false); askBulk('restore', all) }}>
                Restaurar todos ({all.length})
              </button>
              <button className="block w-full border-t border-line px-4 py-3 text-left text-sm font-bold" onClick={() => { setMenu(false); setSelecting(true) }}>
                Seleccionar
              </button>
            </div>
          )}
        </div>
      )}

      {view === 'hidden' && selecting && (
        <div className="space-y-2 rounded-3xl border border-line bg-surface p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">{selected.size} seleccionados</p>
            <button onClick={toggleAll} className="text-sm font-bold text-accent">
              {selected.size === all.length ? 'Quitar selecci\u00f3n' : 'Seleccionar todos'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Btn tone="accent" disabled={bulkBusy || !chosen.length} onClick={() => askBulk('restore', chosen)}>Restaurar</Btn>
            <Btn tone="danger" disabled={bulkBusy || !chosen.length} onClick={() => askBulk('purge', chosen)}>Eliminar</Btn>
            <Btn disabled={bulkBusy} onClick={cancelSelect}>Cancelar</Btn>
          </div>
        </div>
      )}

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
            selecting={selecting}
            selected={selected.has(m.id)}
            onToggle={() => toggle(m.id)}
          />
        ))}
      </div>
    </div>
  )
}
