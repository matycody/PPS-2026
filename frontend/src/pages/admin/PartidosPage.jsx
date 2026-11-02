import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, RotateCcw, ChevronDown, CalendarDays, Search, X, SlidersHorizontal, Trophy } from 'lucide-react'
import { api } from '../../lib/api'
import { STATUS, MODALITY, BRANCH } from '../../lib/format'
import { Btn, Alert, inputCls, Skeleton } from '../../components/ui'
import MatchForm from '../../components/MatchForm'
import MatchRow from '../../components/MatchRow'
import { useConfirm } from '../../components/ConfirmProvider'
import { dayOf, dayTab } from '../../lib/days'
import { usePredictions } from '../../hooks/usePredictions'
import PredictStrip from '../../components/PredictStrip'

const CHIP_STRIP = '-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
const chip = (on) => 'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-bold ' + (on ? 'border-accent bg-accent text-black' : 'border-line bg-surface')

// Solo se puede ocultar un partido que no esté en curso
const canHide = (status) => status === 'SCHEDULED' || status === 'FINISHED' || status === 'CANCELLED'


// Bloque de un torneo: título con ícono y las fechas que se juegan ese día (Fecha 5, Final…), y sus partidos
function TournamentBlock({ g, readOnly, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-3 border-b border-line px-3 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-accent"><Trophy size={16} /></span>
        <div className="min-w-0 flex-1">
          {g.id !== 'none'
            ? <Link to={(readOnly ? '/liga/' : '/admin/torneos/') + g.id} className="block truncate text-sm font-extrabold">{g.name}</Link>
            : <span className="block truncate text-sm font-extrabold">{g.name}</span>}
          {g.labels?.length > 0 && <p className="truncate text-xs text-muted">{g.labels.slice(0, 3).join(' · ')}</p>}
        </div>
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted">{g.list.length} {g.list.length === 1 ? 'partido' : 'partidos'}</span>
      </div>
      <div className="divide-y divide-line">{children}</div>
    </section>
  )
}

function AdminRow({ m, hidden, busy, onHide, onRestore, onPurge, selecting, selected, onToggle, readOnly, prode }) {
  return (
    <MatchRow
      m={m}
      flat
      to={readOnly ? '/partido/' + m.id : '/admin/partidos/' + m.id}
      selecting={selecting}
      selected={selected}
      onToggle={onToggle}
      action={!readOnly && !hidden && canHide(m.status) ? (
        <button disabled={busy} onClick={onHide} aria-label="Eliminar" className="grid h-9 w-9 place-items-center rounded-full text-danger disabled:opacity-40"><Trash2 size={16} /></button>
      ) : null}
      footer={prode ?? (!selecting && hidden ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Btn tone="accent" disabled={busy} onClick={onRestore}><RotateCcw size={16} /> Restaurar</Btn>
          <Btn tone="danger" disabled={busy} onClick={onPurge}><Trash2 size={16} /> Definitivo</Btn>
        </div>
      ) : null)}
    />
  )
}

const PAGE = 50

const plain = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
// Texto buscable de un partido: equipos, torneo, modalidad y rama (el día se filtra con el selector de fecha)
const haystack = (m) => plain([m.teamA?.name, m.teamB?.name, m.tournament?.name ?? 'Amistoso', MODALITY[m.modality], BRANCH[m.branch]].join(' '))
const BACK = 45 // días hacia atrás que se cargan de entrada
const AHEAD = 90 // y hacia adelante
const STEP = 90 // cada tanda extra
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isoDay = (offset) => new Date(Date.now() + offset * 864e5).toLocaleDateString('en-CA')
const byTime = (a, b) => String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? '')) || (a.court || 999) - (b.court || 999)

// readOnly: lo ven los demás roles (y quien no inició sesión): mismo listado y filtros, sin crear, eliminar ni restaurar
export default function PartidosPage({ readOnly = false }) {
  const ask = useConfirm()
  const [matches, setMatches] = useState(null)
  const [tournaments, setTournaments] = useState(null)
  const [teams, setTeams] = useState(null)
  const [status, setStatus] = useState('')
  const [tournamentId, setTournamentId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [q, setQ] = useState('')
  const [win, setWin] = useState(null) // partidos cargados para la vista por día
  const [range, setRange] = useState({ back: BACK, ahead: AHEAD })
  const [extra, setExtra] = useState(null) // 'back' | 'ahead' mientras carga otra tanda
  const [dayPick, setDayPick] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
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

  // Solo la vista de eliminados pagina por servidor; la vista por día carga una ventana de fechas completa
  const query = (offset) => {
    const p = new URLSearchParams({ limit: String(PAGE + 1), offset: String(offset) })
    if (status) p.set('status', status)
    if (tournamentId) p.set('tournamentId', tournamentId)
    if (teamId) p.set('teamId', teamId)
    p.set('hidden', 'true')
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
  useEffect(() => { if (view === 'hidden') { setMatches(null); load() } }, [status, view, tournamentId, teamId])
  useEffect(() => { setSelecting(false); setSelected(new Set()); setMenu(false) }, [status, view, tournamentId, teamId, q])

  // Vista por día: todas las jornadas de la ventana (con los sin fecha); el servidor entrega 200 por pedido, así que se pide por tandas
  const STATUSES_Q = readOnly ? '&status=LIVE,READY,SCHEDULED,SUSPENDED,FINISHED' : ''
  const fetchRange = async (from, to) => {
    const out = []
    for (let offset = 0; offset < 2000; offset += 200) {
      const rows = await api('GET', '/matches?includeUndated=' + (from === isoDay(-BACK) ? 'true' : 'false') + '&limit=200&offset=' + offset + '&from=' + from + '&to=' + to + STATUSES_Q)
      out.push(...rows)
      if (rows.length < 200) break
    }
    return out
  }
  const mergeWin = (rows) => setWin((prev) => {
    const mp = new Map((prev ?? []).map((m) => [m.id, m]))
    rows.forEach((m) => mp.set(m.id, m))
    return [...mp.values()]
  })
  const loadWin = () => fetchRange(isoDay(-BACK), isoDay(AHEAD)).then(setWin).catch((e) => setErr(e.message))
  useEffect(() => { if (view === 'active') { setWin(null); setRange({ back: BACK, ahead: AHEAD }); loadWin() } }, [view])
  const loadMoreDays = async (dir) => {
    if (extra) return
    setExtra(dir)
    try {
      const lo = dir === 'back' ? range.back : range.ahead
      const [from, to] = dir === 'back' ? [isoDay(-(lo + STEP)), isoDay(-lo + 1)] : [isoDay(lo), isoDay(lo + STEP + 1)]
      mergeWin(await fetchRange(from, to))
      setRange((r) => ({ ...r, [dir]: r[dir] + STEP }))
    } catch (e) { setErr(e.message) } finally { setExtra(null) }
  }
  // Calendario: salta a un día aunque esté fuera de la ventana cargada
  const jumpTo = async (day) => {
    if (!DATE_RE.test(day)) return
    setDayPick(day)
    if ((win ?? []).some((m) => dayOf(m.scheduledAt) === day)) return
    try { mergeWin(await fetchRange(day, day)) } catch (e) { setErr(e.message) }
  }
  useEffect(() => {
    api('GET', '/tournaments').then(setTournaments).catch((e) => setErr(e.message))
    api('GET', '/teams').then(setTeams).catch((e) => setErr(e.message))
  }, [])

  async function create(body) {
    setBusyId('new'); setErr('')
    try {
      await api('POST', '/matches', body)
      setOpen(false)
      await (view === 'hidden' ? load() : loadWin())
    } catch (e) { setErr(e.errors?.join(' · ') || e.data?.errors?.join(' · ') || e.message) } finally { setBusyId(null) }
  }

  async function hide(m) {
    const name = (m.teamA?.name ?? '—') + ' vs ' + (m.teamB?.name ?? '—')
    if (!(await ask({ title: 'Eliminar partido', message: '¿Eliminar ' + name + '? Podés restaurarlo después desde "Eliminados".', confirmText: 'Eliminar', danger: true }))) return
    setBusyId(m.id); setErr('')
    try {
      await api('POST', '/matches/' + m.id + '/hide')
      setMatches((prev) => (prev ?? []).filter((x) => x.id !== m.id))
      setWin((prev) => (prev ?? []).filter((x) => x.id !== m.id))
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

  const words = plain(q).split(/\s+/).filter(Boolean)
  const passes = (m) => {
    if (status && m.status !== status) return false
    if (tournamentId && m.tournament?.id !== tournamentId) return false
    if (teamId && m.teamA?.id !== teamId && m.teamB?.id !== teamId) return false
    if (!words.length) return true
    const h = haystack(m)
    return words.every((w) => h.includes(w))
  }
  const all = (view === 'hidden' ? (matches ?? []) : (win ?? [])).filter((m) => (view === 'hidden' ? words.every((w) => haystack(m).includes(w)) : passes(m)))
  const chosen = all.filter((x) => selected.has(x.id))
  const toggle = (id) => setSelected((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const toggleAll = () => setSelected(selected.size === all.length ? new Set() : new Set(all.map((x) => x.id)))
  const cancelSelect = () => { setSelecting(false); setSelected(new Set()) }

  // Vista por día: pestañas de días (con cantidad), día elegido y, dentro, un bloque por torneo
  const dv = useMemo(() => {
    if (view !== 'active') return null
    const byDay = {}
    const undated = []
    all.forEach((m) => { const d = dayOf(m.scheduledAt); if (d) (byDay[d] ??= []).push(m); else undated.push(m) })
    const today = dayOf(new Date())
    const keys = Object.keys(byDay)
    const auto = keys.includes(today) ? today : [...keys].sort().find((d) => d >= today) ?? [...keys].sort().pop() ?? (undated.length ? 'none' : null)
    const sel = dayPick === 'none' || (DATE_RE.test(dayPick) && dayPick) ? dayPick : auto
    const tabs = [...new Set([...keys, today, ...(DATE_RE.test(sel ?? '') ? [sel] : [])])].sort()
    const list = [...(sel === 'none' ? undated : byDay[sel] ?? [])].sort(byTime)
    const groups = []
    list.forEach((m) => {
      const id = m.tournament?.id ?? 'none'
      let g = groups.find((x) => x.id === id)
      if (!g) groups.push((g = { id, name: m.tournament?.name ?? 'Amistosos', list: [], labels: [] }))
      g.list.push(m)
      const l = m.phase?.label
      if (l && !g.labels.includes(l)) g.labels.push(l)
    })
    return { byDay, tabs, sel, groups, hasUndated: undated.length > 0, undatedN: undated.length }
  }, [win, view, q, status, tournamentId, teamId, dayPick])

  const { map: prode, pick: pickProde } = usePredictions(dv ? dv.groups.flatMap((g) => g.list.map((m) => m.id)) : [])

  // El día elegido queda a la vista en la tira
  useEffect(() => { if (dv?.sel) document.getElementById('pday-' + dv.sel)?.scrollIntoView({ inline: 'center', block: 'nearest' }) }, [dv?.sel, win === null])

  const activeFilters = [status, tournamentId, teamId].filter(Boolean).length + (q ? 1 : 0)
  const clearFilters = () => { setQ(''); setTournamentId(''); setStatus(''); setTeamId('') }

  // Eliminados: lista plana por torneo (sin días)
  const sections = []
  if (view === 'hidden') all.forEach((m) => {
    let sec = sections[0]
    if (!sec) sections.push((sec = { key: 'all', dk: undefined, iso: null, groups: [] }))
    const id = m.tournament?.id ?? 'none'
    let g = sec.groups.find((x) => x.id === id)
    if (!g) sec.groups.push((g = { id, name: m.tournament?.name ?? 'Amistosos', list: [] }))
    g.list.push(m)
  })

  const ready = tournaments && teams

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Partidos</h1>
        {view === 'active' && !readOnly && (
          <Btn tone="accent" onClick={() => setOpen((o) => !o)} className="px-4 py-2"><Plus size={16} /> Nuevo</Btn>
        )}
      </div>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {ok && <Alert tone="ok" onClose={() => setOk('')}>{ok}</Alert>}

      {open && !readOnly && view === 'active' && ready && (
        <div className="rounded-3xl border border-line bg-surface p-5">
          <MatchForm tournaments={tournaments} teams={teams} onSubmit={create} label="Crear partido" busy={busyId === 'new'} />
        </div>
      )}

      {!readOnly && (
        <div className="flex gap-2">
          <Btn tone={view === 'active' ? 'accent' : 'base'} onClick={() => setView('active')} className="flex-1">Partidos</Btn>
          <Btn tone={view === 'hidden' ? 'accent' : 'base'} onClick={() => setView('hidden')} className="flex-1">Eliminados</Btn>
        </div>
      )}

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

      {view === 'active' && dv && (
        <div className="space-y-3">
          {/* Días */}
          <div className="flex items-center gap-2">
            <div className={CHIP_STRIP + ' min-w-0 flex-1'}><div className="flex gap-2">
              <button onClick={() => loadMoreDays('back')} disabled={!!extra} className="shrink-0 whitespace-nowrap rounded-full border border-dashed border-line bg-surface px-3.5 py-2 text-sm font-bold text-muted disabled:opacity-60">{extra === 'back' ? 'Cargando…' : '‹ 90 días antes'}</button>
              {dv.tabs.map((d) => (
                <button key={d} id={'pday-' + d} onClick={() => setDayPick(d)} aria-pressed={dv.sel === d} className={chip(dv.sel === d)}>
                  {dayTab(d)}{dv.byDay[d]?.length ? ' · ' + dv.byDay[d].length : ''}
                </button>
              ))}
              {dv.hasUndated && <button onClick={() => setDayPick('none')} aria-pressed={dv.sel === 'none'} className={chip(dv.sel === 'none')}>Sin programación · {dv.undatedN}</button>}
              <button onClick={() => loadMoreDays('ahead')} disabled={!!extra} className="shrink-0 whitespace-nowrap rounded-full border border-dashed border-line bg-surface px-3.5 py-2 text-sm font-bold text-muted disabled:opacity-60">{extra === 'ahead' ? 'Cargando…' : '90 días después ›'}</button>
            </div></div>
            <label className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface" aria-label="Elegir fecha">
              <CalendarDays size={18} />
              <input type="date" className="absolute inset-0 h-full w-full opacity-0" value={DATE_RE.test(dv.sel ?? '') ? dv.sel : ''} onChange={(e) => jumpTo(e.target.value)} />
            </label>
            <button type="button" onClick={() => setFiltersOpen((o) => !o)} aria-pressed={filtersOpen} aria-label="Filtros"
              className={'relative grid h-10 w-10 shrink-0 place-items-center rounded-full border ' + (filtersOpen || activeFilters ? 'border-accent text-accent' : 'border-line bg-surface')}>
              <SlidersHorizontal size={18} />
              {activeFilters > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-black">{activeFilters}</span>}
            </button>
          </div>

          {/* Filtros plegables: buscar, torneo, estado y equipo */}
          {filtersOpen && (
            <div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
              <label className="relative block">
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <input className={inputCls + ' !pl-10'} placeholder="Buscar equipo, modalidad o rama" value={q} onChange={(e) => setQ(e.target.value)} />
                {q && <button onClick={() => setQ('')} aria-label="Borrar búsqueda" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"><X size={16} /></button>}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select className={inputCls} value={tournamentId} onChange={(e) => setTournamentId(e.target.value)}>
                  <option value="">Todos los torneos</option>
                  {(tournaments ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Todos los estados</option>
                  {Object.entries(STATUS).filter(([k]) => !readOnly || k !== 'CANCELLED').map(([k, st]) => <option key={k} value={k}>{st.label}</option>)}
                </select>
                <select className={inputCls + ' col-span-2'} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  <option value="">Todos los equipos</option>
                  {(teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {activeFilters > 0 && <button onClick={clearFilters} className="text-xs font-bold text-accent">Limpiar filtros</button>}
            </div>
          )}
        </div>
      )}

      {view === 'hidden' && (
        <div className="grid grid-cols-2 gap-2">
          <input className={inputCls + ' col-span-2'} placeholder="Buscar equipo, modalidad o rama" value={q} onChange={(e) => setQ(e.target.value)} />
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
      )}

      {view === 'active' && win === null && <Skeleton />}
      {view === 'active' && win && dv && dv.groups.length === 0 && (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">{dv.sel ? 'No hay partidos este día' + (activeFilters ? ' con esos filtros.' : '.') : 'No hay partidos' + (activeFilters ? ' con esos filtros.' : '.')}</p>
      )}
      {view === 'active' && dv && dv.groups.map((g) => (
        <TournamentBlock key={g.id} g={g} readOnly={readOnly}>
          {g.list.map((m) => (
            <AdminRow key={m.id} m={m} hidden={false} busy={busyId === m.id} onHide={() => hide(m)} onRestore={() => restore(m)} onPurge={() => purge(m)} readOnly={readOnly} selecting={false} selected={false} onToggle={() => {}} prode={<PredictStrip m={m} info={prode[m.id]} onPick={pickProde} />} />
          ))}
        </TournamentBlock>
      ))}

      {view === 'hidden' && matches === null && <Skeleton />}
      {view === 'hidden' && matches && matches.length === 0 && <p className="text-muted">No hay partidos eliminados.</p>}
      {view === 'hidden' && matches && matches.length > 0 && all.length === 0 && <p className="text-muted">No hay partidos que coincidan con la búsqueda.</p>}
      {view === 'hidden' && (
        <div className="space-y-4">
          {sections.map((sec) => sec.groups.map((g) => (
            <TournamentBlock key={g.id} g={g} readOnly={readOnly}>
              {g.list.map((m) => (
                <AdminRow key={m.id} m={m} hidden busy={busyId === m.id} onHide={() => hide(m)} onRestore={() => restore(m)} onPurge={() => purge(m)} readOnly={readOnly} selecting={selecting} selected={selected.has(m.id)} onToggle={() => toggle(m.id)} />
              ))}
            </TournamentBlock>
          )))}
        </div>
      )}
      {view === 'hidden' && hasMore && <Btn onClick={loadMore} disabled={moreBusy} className="w-full">{moreBusy ? 'Cargando\u2026' : 'Cargar m\u00e1s'}</Btn>}
    </div>
  )
}
