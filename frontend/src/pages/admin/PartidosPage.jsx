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

const hourOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--')
const dayKey = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA') : 'none')
const dayLabel = (iso) => {
  if (!iso) return 'Sin fecha'
  const d = new Date(iso)
  const t = new Date(); t.setHours(0, 0, 0, 0)
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t.getTime()) / 864e5)
  const base = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  return (diff === 0 ? 'Hoy \u00b7 ' : diff === 1 ? 'Ma\u00f1ana \u00b7 ' : '') + base
}

function MatchRow({ m, hidden, busy, onHide, onRestore, onPurge, selecting, selected, onToggle }) {
  return (
    <div
      onClick={selecting ? onToggle : undefined}
      className={'rounded-2xl border bg-surface px-3 py-2.5 ' + (selecting ? 'cursor-pointer ' : '') + (selected ? 'border-accent ring-2 ring-accent/40' : statusBorder(m.status))}
    >
      <div className="flex items-center gap-3">
        {selecting && (
          <span className={'grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 ' + (selected ? 'border-accent bg-accent text-black' : 'border-line')}>
            {selected && <Check size={16} />}
          </span>
        )}
        <div className="w-12 shrink-0 text-center">
          <p className="font-mono text-sm font-bold">{hourOf(m.scheduledAt)}</p>
          <p className="text-[10px] text-muted">{courtLabel(m.court)}</p>
        </div>
        <Link to={'/admin/partidos/' + m.id} onClick={(e) => selecting && e.preventDefault()} className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{(m.teamA?.name ?? '\u2014') + ' vs ' + (m.teamB?.name ?? '\u2014')}</p>
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted">{matchInfo(m)}</p>
        </Link>
        <StatusPill status={m.status} />
        {!selecting && !hidden && canHide(m.status) && (
          <button disabled={busy} onClick={onHide} aria-label="Eliminar" className="shrink-0 rounded-lg p-2 text-danger disabled:opacity-40"><Trash2 size={16} /></button>
        )}
      </div>
      {!selecting && hidden && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Btn tone="accent" disabled={busy} onClick={onRestore}><RotateCcw size={16} /> Restaurar</Btn>
          <Btn tone="danger" disabled={busy} onClick={onPurge}><Trash2 size={16} /> Definitivo</Btn>
        </div>
      )}
    </div>
  )
}

const PAGE = 50
const PERIODS = [
  { id: 'upcoming', label: 'Hoy y pr\u00f3ximos' },
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Pr\u00f3ximos 7 d\u00edas' },
  { id: 'past', label: 'Anteriores' },
  { id: 'all', label: 'Todos (incluye sin fecha)' },
]

export default function PartidosPage() {
  const ask = useConfirm()
  const [matches, setMatches] = useState(null)
  const [tournaments, setTournaments] = useState(null)
  const [teams, setTeams] = useState(null)
  const [status, setStatus] = useState('')
  const [tournamentId, setTournamentId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [period, setPeriod] = useState('upcoming')
  const [hasMore, setHasMore] = useState(false)
  const [moreBusy, setMoreBusy] = useState(false)
  const [view, setView] = useState('active') // 'active' | 'hidden'
  const [open, setOpen] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [ok, setOk] = useState('')
  const [menu, setMenu] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [err, setErr] = useState('')

  const query = (offset) => {
    const p = new URLSearchParams({ limit: String(PAGE + 1), offset: String(offset) })
    if (status) p.set('status', status)
    if (tournamentId) p.set('tournamentId', tournamentId)
    if (teamId) p.set('teamId', teamId)
    if (view === 'hidden') p.set('hidden', 'true')
    else {
      const t0 = new Date(); t0.setHours(0, 0, 0, 0)
      const t1 = new Date(t0.getTime() + 864e5 - 1)
      if (period === 'upcoming') p.set('from', t0.toISOString())
      if (period === 'today') { p.set('from', t0.toISOString()); p.set('to', t1.toISOString()) }
      if (period === 'week') { p.set('from', t0.toISOString()); p.set('to', new Date(t0.getTime() + 7 * 864e5).toISOString()) }
      if (period === 'past') p.set('to', new Date(t0.getTime() - 1).toISOString())
    }
    return p
  }
  const load = () => api('GET', '/matches?' + query(0))
    .then((r) => { setHasMore(r.length > PAGE); setMatches(r.slice(0, PAGE)) })
    .catch((e) => setErr(e.message))
  const loadMore = async () => {
    setMoreBusy(true)
    try {
      const r = await api('GET', '/matches?' + query((matches ?? []).length))
      setHasMore(r.length > PAGE)
      setMatches((prev) => [...(prev ?? []), ...r.slice(0, PAGE)])
    } catch (e) { setErr(e.message) } finally { setMoreBusy(false) }
  }
  useEffect(() => { setMatches(null); load() }, [status, view, tournamentId, teamId, period])
  useEffect(() => { setSelecting(false); setSelected(new Set()); setMenu(false) }, [status, view, tournamentId, teamId, period])
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
                Eliminar {hasMore ? 'los primeros ' : 'todos '}({all.length})
              </button>
              <button className="block w-full border-t border-line px-4 py-3 text-left text-sm font-bold text-accent" onClick={() => { setMenu(false); askBulk('restore', all) }}>
                Restaurar {hasMore ? 'los primeros ' : 'todos '}({all.length})
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

      <div className="grid grid-cols-2 gap-2">
        {view === 'active' && (
          <select className={inputCls + ' col-span-2'} value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        )}
        <select className={inputCls} value={tournamentId} onChange={(e) => setTournamentId(e.target.value)}>
          <option value="">Todos los torneos</option>
          {(tournaments ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS).map(([k, st]) => <option key={k} value={k}>{st.label}</option>)}
        </select>
        <select className={inputCls + ' col-span-2'} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Todos los equipos</option>
          {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {matches === null && <p className="text-muted">Cargando…</p>}
      {matches && matches.length === 0 && (
        <p className="text-muted">{view === 'hidden' ? 'No hay partidos eliminados.' : 'No hay partidos.'}</p>
      )}
      <div className="space-y-2">
        {(matches ?? []).map((m, i, arr) => (
          <div key={m.id} className="space-y-2">
            {view === 'active' && (i === 0 || dayKey(arr[i - 1].scheduledAt) !== dayKey(m.scheduledAt)) && (
              <h2 className="pt-2 text-xs font-bold uppercase tracking-widest text-muted">{dayLabel(m.scheduledAt)}</h2>
            )}
            <MatchRow
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
          </div>
        ))}
      </div>
      {hasMore && <Btn onClick={loadMore} disabled={moreBusy} className="w-full">{moreBusy ? 'Cargando\u2026' : 'Cargar m\u00e1s'}</Btn>}
    </div>
  )
}
