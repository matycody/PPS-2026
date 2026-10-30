import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Minus, Plus, Wand2, X } from 'lucide-react'
import { api } from '../../lib/api'
import { Btn, Alert, inputCls } from '../../components/ui'
import { BRANCH, MODALITY, phaseCmp, normMatch } from '../../lib/format'
import { dayOf, dayTab } from '../../lib/days'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'
import { useConfirm } from '../../components/ConfirmProvider'

const TURN_MIN = 40 // un partido ocupa 40 minutos (2 tiempos de 20)
const MAX_COURTS = 8
const MAX_TURNS = 30
const POOL_STEP = 40
const key = (court, row) => court + '|' + row
const shiftDay = (d, n) => dayOf(new Date(new Date(d + 'T12:00:00').getTime() + n * 864e5).toISOString())
const pad = (n) => String(n).padStart(2, '0')
const slotDate = (day, start, row) => {
  const [h, m] = start.split(':').map(Number)
  return new Date(day + 'T' + pad(h) + ':' + pad(m) + ':00').getTime() + row * TURN_MIN * 60000
}
const rowLabel = (day, start, row) => {
  const d = new Date(slotDate(day, start, row))
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}
const teamsOf = (m) => [m.teamA?.id, m.teamB?.id].filter(Boolean)
const byFixture = (a, b) => (a.tournament?.name ?? '').localeCompare(b.tournament?.name ?? '') || phaseCmp(a, b) || String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? ''))

// Grilla inicial: los partidos del día que ya tienen cancha y caen justo en un turno
function buildGrid(matches, day, start) {
  const grid = {}
  let maxCourt = 0
  let maxRow = -1
  matches.forEach((m) => {
    if (!m.scheduledAt || !m.court || m.court > MAX_COURTS || dayOf(m.scheduledAt) !== day) return
    const diff = (new Date(m.scheduledAt).getTime() - slotDate(day, start, 0)) / 60000
    if (diff < 0 || diff % TURN_MIN !== 0) return
    const row = diff / TURN_MIN
    if (row >= MAX_TURNS || grid[key(m.court, row)]) return
    grid[key(m.court, row)] = m.id
    maxCourt = Math.max(maxCourt, m.court)
    maxRow = Math.max(maxRow, row)
  })
  return { grid, maxCourt, maxRow }
}

function TeamLine({ t }) {
  return <span className="block truncate">{t?.name ?? 'Por definir'}</span>
}

export default function JornadaPage() {
  const ask = useConfirm()
  const [all, setAll] = useState(null) // partidos Programados y Habilitados
  const [tournaments, setTournaments] = useState([])
  const [day, setDay] = useState(() => dayOf(new Date().toISOString()))
  const [start, setStart] = useState('10:00')
  const [courts, setCourts] = useState(2)
  const [turns, setTurns] = useState(8)
  const [grid, setGrid] = useState({}) // 'cancha|turno' -> id de partido (borrador)
  const [base, setBase] = useState({}) // lo que hay guardado
  const [sel, setSel] = useState(null)
  const [q, setQ] = useState('')
  const [fTour, setFTour] = useState('')
  const [fBranch, setFBranch] = useState('')
  const [fWhen, setFWhen] = useState('all') // all | none | day
  const [shown, setShown] = useState(POOL_STEP)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [errs, setErrs] = useState([])
  const [ok, setOk] = useState('')

  const load = useCallback(async () => {
    const rows = []
    for (let off = 0; off < 2000; off += 200) {
      const r = await api('GET', '/matches?status=SCHEDULED,READY&limit=200&offset=' + off)
      rows.push(...r.map(normMatch))
      if (r.length < 200) break
    }
    setAll(rows)
  }, [])

  useEffect(() => {
    load().catch((e) => setErr(e.message))
    api('GET', '/tournaments').then(setTournaments).catch(() => {})
  }, [load])

  const byId = useMemo(() => Object.fromEntries((all ?? []).map((m) => [m.id, m])), [all])

  const dirty = useMemo(() => {
    const ks = new Set([...Object.keys(grid), ...Object.keys(base)])
    return [...ks].some((k) => grid[k] !== base[k])
  }, [grid, base])

  const { modal: leaveModal } = useLeaveGuard(dirty, '', {
    title: '¿Salir sin guardar?',
    message: 'Armaste una jornada y no la guardaste. Si salís, se pierde.',
    stay: 'Quedarme',
    leave: 'Salir',
  })

  // Reconstruye la grilla guardada al cargar los datos o cambiar de día / hora de inicio
  const rebuild = useCallback((d, s, list) => {
    const { grid: g, maxCourt, maxRow } = buildGrid(list, d, s)
    setGrid(g)
    setBase(g)
    setSel(null)
    setCourts((c) => Math.max(c, maxCourt))
    setTurns((t) => Math.max(t, maxRow + 1))
  }, [])
  useEffect(() => { if (all) rebuild(day, start, all) }, [all]) // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDiscard = async () => !dirty || (await ask({ title: 'Descartar cambios', message: 'Tenés cambios sin guardar. Si seguís, se pierden.', confirmText: 'Descartar', cancelText: 'Volver', danger: true }))
  const changeDay = async (d) => { if (d === day || !(await confirmDiscard())) return; setDay(d); rebuild(d, start, all ?? []) }
  const changeStart = async (s) => { if (!s || s === start || !(await confirmDiscard())) return; setStart(s); rebuild(day, s, all ?? []) }

  // Partidos ubicados dentro de la grilla visible
  const placedIds = useMemo(() => {
    const set = new Set()
    Object.entries(grid).forEach(([k, id]) => {
      const [c, r] = k.split('|').map(Number)
      if (c <= courts && r < turns) set.add(id)
    })
    return set
  }, [grid, courts, turns])

  // Avisos: equipo repetido en el mismo turno (rojo) o en turnos seguidos (ámbar)
  const flags = useMemo(() => {
    const out = {}
    const rowTeams = {}
    Object.entries(grid).forEach(([k, id]) => {
      const [c, r] = k.split('|').map(Number)
      if (c > courts || r >= turns || !byId[id]) return
      ;(rowTeams[r] ??= []).push({ k, teams: teamsOf(byId[id]) })
    })
    Object.entries(rowTeams).forEach(([r, list]) => {
      list.forEach((a) => {
        if (list.some((b) => b !== a && b.teams.some((t) => a.teams.includes(t)))) out[a.k] = 'bad'
        else if ((rowTeams[Number(r) + 1] ?? []).some((b) => b.teams.some((t) => a.teams.includes(t)))) out[a.k] = 'warn'
      })
    })
    return out
  }, [grid, courts, turns, byId])
  const badCount = Object.values(flags).filter((f) => f === 'bad').length

  const pool = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (all ?? [])
      .filter((m) => !placedIds.has(m.id))
      .filter((m) => !fTour || m.tournament?.id === fTour)
      .filter((m) => !fBranch || m.branch === fBranch)
      .filter((m) => fWhen === 'all' || (fWhen === 'none' ? !m.scheduledAt : m.scheduledAt && dayOf(m.scheduledAt) === day))
      .filter((m) => !t || (m.teamA?.name ?? '').toLowerCase().includes(t) || (m.teamB?.name ?? '').toLowerCase().includes(t))
      .sort(byFixture)
  }, [all, placedIds, q, fTour, fBranch, fWhen, day])

  const positionOf = (id) => Object.keys(grid).find((k) => grid[k] === id)

  const tapCell = (c, r) => {
    const k = key(c, r)
    const here = grid[k]
    setOk('')
    if (!sel) { if (here) setSel(here); return }
    if (here === sel) { setSel(null); return }
    const from = positionOf(sel)
    const g = { ...grid }
    if (from) delete g[from]
    g[k] = sel
    if (here && from) g[from] = here // intercambio
    setGrid(g)
    setSel(null)
  }
  const unplace = (k) => { const g = { ...grid }; delete g[k]; setGrid(g); setSel(null) }

  const autoFill = () => {
    const g = { ...grid }
    const rowTeams = (r) => {
      const s = new Set()
      for (let c = 1; c <= courts; c++) { const m = byId[g[key(c, r)]]; if (m) teamsOf(m).forEach((t) => s.add(t)) }
      return s
    }
    const queue = [...pool]
    let placed = 0
    for (let r = 0; r < turns; r++) {
      for (let c = 1; c <= courts; c++) {
        if (g[key(c, r)] || !queue.length) continue
        const used = rowTeams(r)
        const prev = r > 0 ? rowTeams(r - 1) : new Set()
        // primero uno que no repita equipo en el turno ni juegue seguido; si no hay, solo que no se repita en el turno
        let i = queue.findIndex((m) => teamsOf(m).every((t) => !used.has(t) && !prev.has(t)))
        if (i < 0) i = queue.findIndex((m) => teamsOf(m).every((t) => !used.has(t)))
        if (i < 0) continue
        g[key(c, r)] = queue[i].id
        queue.splice(i, 1)
        placed++
      }
    }
    setGrid(g)
    setSel(null)
    setOk(placed ? placed + ' partidos ubicados. Revisalos y guardá.' : 'No había partidos para ubicar con los filtros actuales.')
  }

  const clearGrid = async () => {
    if (!Object.keys(grid).length) return
    if (!(await ask({ title: 'Vaciar el tablero', message: 'Los partidos vuelven a la lista de sin ubicar (no se guarda hasta que apretes Guardar).', confirmText: 'Vaciar', cancelText: 'Volver', danger: true }))) return
    setGrid({})
    setSel(null)
  }

  const save = async () => {
    const items = []
    Object.entries(grid).forEach(([k, id]) => {
      if (base[k] === id) return
      const [c, r] = k.split('|').map(Number)
      items.push({ matchId: id, court: c, scheduledAt: new Date(slotDate(day, start, r)).toISOString() })
    })
    // Los que estaban guardados en la grilla y se sacaron: quedan sin cancha y conservan su horario
    const nowPlaced = new Set(Object.values(grid))
    new Set(Object.values(base)).forEach((id) => {
      if (!nowPlaced.has(id)) items.push({ matchId: id, court: null, scheduledAt: byId[id]?.scheduledAt ?? null })
    })
    if (!items.length) return
    setBusy(true); setErr(''); setErrs([]); setOk('')
    try {
      const r = await api('POST', '/matches/bulk-schedule', { items })
      await load()
      setOk('Jornada guardada: ' + r.updated + ' partidos actualizados')
    } catch (e) {
      setErr(e.data?.error || e.message)
      setErrs(e.data?.errors ?? [])
    } finally {
      setBusy(false)
    }
  }

  const stepper = (label, value, set, min, max) => (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-bg px-2 py-1.5">
      <span className="pl-1 text-xs font-bold text-muted">{label}</span>
      <div className="flex items-center gap-1">
        <button aria-label={'Menos ' + label} disabled={value <= min} onClick={() => set(value - 1)} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 disabled:opacity-30"><Minus size={14} /></button>
        <span className="w-6 text-center font-extrabold">{value}</span>
        <button aria-label={'Más ' + label} disabled={value >= max} onClick={() => set(value + 1)} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 disabled:opacity-30"><Plus size={14} /></button>
      </div>
    </div>
  )

  if (!all) return <p className="mt-10 text-center text-muted">{err || 'Cargando…'}</p>

  const tournamentName = (m) => m.tournament?.name ?? 'Amistoso'
  const cols = Array.from({ length: courts }, (_, i) => i + 1)
  const rows = Array.from({ length: turns }, (_, i) => i)

  return (
    <div className="space-y-4">
      {leaveModal}
      <div className="flex items-center justify-between">
        <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Armar jornada</h1>
        <Link to="/admin/canchas" className="text-xs font-bold text-muted">Dashboard ›</Link>
      </div>
      {err && <Alert onClose={() => { setErr(''); setErrs([]) }}>{err}{errs.map((e) => <span key={e} className="mt-1 block font-semibold">• {e}</span>)}</Alert>}
      {ok && <Alert tone="ok" onClose={() => setOk('')}>{ok}</Alert>}

      <section className="space-y-3 rounded-3xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between rounded-2xl border border-line bg-bg px-2 py-1.5">
          <button aria-label="Día anterior" onClick={() => changeDay(shiftDay(day, -1))} className="grid h-9 w-9 place-items-center rounded-full bg-surface-2"><ChevronLeft size={18} /></button>
          <button onClick={() => changeDay(dayOf(new Date().toISOString()))} className="text-sm font-extrabold">{dayTab(day)} · {day.split('-').reverse().join('/')}</button>
          <button aria-label="Día siguiente" onClick={() => changeDay(shiftDay(day, 1))} className="grid h-9 w-9 place-items-center rounded-full bg-surface-2"><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {stepper('Canchas', courts, setCourts, 1, MAX_COURTS)}
          {stepper('Turnos', turns, setTurns, 1, MAX_TURNS)}
          <label className="flex items-center justify-between gap-2 rounded-xl border border-line bg-bg px-3 py-1.5">
            <span className="text-xs font-bold text-muted">Inicio</span>
            <input type="time" value={start} onChange={(e) => changeStart(e.target.value)} className="bg-transparent py-1 text-right font-extrabold outline-none" />
          </label>
        </div>
        <p className="text-xs">Cada turno dura {TURN_MIN} min (2 tiempos de 20). Tocá un partido de la lista y después una celda; tocá una celda ocupada para moverla o intercambiarla.</p>
      </section>

      <section className="space-y-2">
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="sticky left-0 z-10 w-14 bg-surface px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-muted">Hora</th>
                {cols.map((c) => <th key={c} className="min-w-[8.5rem] px-2 py-2 text-[11px] font-bold uppercase tracking-wide">Cancha {c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r} className="border-b border-line last:border-0">
                  <td className="sticky left-0 z-10 bg-surface px-2 py-1 text-xs font-extrabold">{rowLabel(day, start, r)}</td>
                  {cols.map((c) => {
                    const k = key(c, r)
                    const m = byId[grid[k]]
                    const flag = flags[k]
                    const on = m && sel === m.id
                    return (
                      <td key={k} className="p-1 align-top">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => tapCell(c, r)}
                          onKeyDown={(e) => { if (e.key === 'Enter') tapCell(c, r) }}
                          className={'relative min-h-[3.75rem] rounded-xl border px-2 py-1.5 text-xs font-semibold ' + (m
                            ? (on ? 'border-accent bg-accent/20' : flag === 'bad' ? 'border-danger bg-danger/10' : flag === 'warn' ? 'border-warn bg-warn/10' : 'border-line bg-surface-2')
                            : 'grid place-items-center border-dashed border-line text-muted' + (sel ? ' bg-accent/5' : ''))}
                        >
                          {m ? (
                            <>
                              <TeamLine t={m.teamA} />
                              <TeamLine t={m.teamB} />
                              <span className="mt-0.5 block truncate text-[10px] font-bold uppercase text-muted">{tournamentName(m)}</span>
                              {flag && <span className={'absolute right-6 top-1 text-[10px] font-extrabold uppercase ' + (flag === 'bad' ? 'text-danger' : 'text-warn')}>{flag === 'bad' ? 'Choque' : 'Seguido'}</span>}
                              <button aria-label="Sacar" onClick={(e) => { e.stopPropagation(); unplace(k) }} className="absolute right-1 top-1 text-muted"><X size={14} /></button>
                            </>
                          ) : <Plus size={16} />}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {badCount > 0 && <p className="text-xs font-bold text-danger">Hay {badCount} partidos con un equipo repetido en el mismo turno. El servidor no deja guardar así.</p>}

        <div className="grid grid-cols-2 gap-2">
          <Btn disabled={busy || !pool.length} onClick={autoFill}><Wand2 size={16} /> Autoarmar</Btn>
          <Btn disabled={busy || !Object.keys(grid).length} onClick={clearGrid}>Vaciar tablero</Btn>
        </div>
        <div className="flex gap-2">
          <Btn className="flex-1" disabled={busy || !dirty} onClick={() => rebuild(day, start, all)}>Descartar</Btn>
          <Btn tone="accent" className="flex-1" disabled={busy || !dirty || badCount > 0} onClick={save}>{busy ? 'Guardando…' : 'Guardar jornada'}</Btn>
        </div>
      </section>

      <section className="space-y-3 rounded-3xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">Sin ubicar</p>
          <span className="text-[11px] font-bold uppercase tracking-wide">{pool.length} partidos</span>
        </div>
        <input className={inputCls} placeholder="Buscar equipo" value={q} onChange={(e) => { setQ(e.target.value); setShown(POOL_STEP) }} />
        <div className="grid grid-cols-2 gap-2">
          <select className={inputCls} value={fTour} onChange={(e) => { setFTour(e.target.value); setShown(POOL_STEP) }}>
            <option value="">Todos los torneos</option>
            {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className={inputCls} value={fBranch} onChange={(e) => { setFBranch(e.target.value); setShown(POOL_STEP) }}>
            <option value="">Todas las ramas</option>
            {Object.entries(BRANCH).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {[['all', 'Todos'], ['none', 'Sin horario'], ['day', 'De este día']].map(([v, l]) => (
            <button key={v} onClick={() => { setFWhen(v); setShown(POOL_STEP) }} className={'flex-1 rounded-full border px-3 py-1.5 text-xs font-bold ' + (fWhen === v ? 'border-accent bg-accent text-black' : 'border-line bg-surface-2')}>{l}</button>
          ))}
        </div>

        <div className="space-y-1.5">
          {pool.slice(0, shown).map((m) => (
            <button
              key={m.id}
              onClick={() => setSel(sel === m.id ? null : m.id)}
              className={'flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm ' + (sel === m.id ? 'border-accent bg-accent/20' : 'border-line bg-surface-2')}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{m.teamA?.name ?? 'Por definir'} vs {m.teamB?.name ?? 'Por definir'}</span>
                <span className="block truncate text-[11px] font-semibold uppercase text-muted">
                  {[tournamentName(m), MODALITY[m.modality], BRANCH[m.branch], m.phase?.label].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="shrink-0 text-right text-[11px] font-bold uppercase text-muted">
                {m.scheduledAt ? new Date(m.scheduledAt).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Sin horario'}
                {m.court ? <span className="block">Cancha {m.court}</span> : null}
              </span>
            </button>
          ))}
          {pool.length === 0 && <p className="text-sm text-muted">No quedan partidos con estos filtros.</p>}
          {pool.length > shown && (
            <button onClick={() => setShown((n) => n + POOL_STEP)} className="w-full rounded-xl border border-line py-2.5 text-xs font-extrabold uppercase tracking-wide text-accent">Ver {Math.min(POOL_STEP, pool.length - shown)} más</button>
          )}
        </div>
      </section>
    </div>
  )
}
