import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Minus, Plus, Wand2, X } from 'lucide-react'
import { api } from '../../lib/api'
import { Btn, Alert, inputCls } from '../../components/ui'
import { BRANCH, MODALITY, phaseCmp, normMatch } from '../../lib/format'
import { dayOf, dayTab } from '../../lib/days'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'
import { useConfirm } from '../../components/ConfirmProvider'

const DEFAULT_TURN = 60 // por defecto un partido ocupa 1 hora; la organización lo puede cambiar
const TURN_STEP = 5
const MAX_COURTS = 8
const MAX_TURNS = 30
const POOL_STEP = 40
const key = (court, row) => court + '|' + row
const shiftDay = (d, n) => dayOf(new Date(new Date(d + 'T12:00:00').getTime() + n * 864e5).toISOString())
const pad = (n) => String(n).padStart(2, '0')
const slotDate = (day, start, row, turn) => {
  const [h, m] = start.split(':').map(Number)
  return new Date(day + 'T' + pad(h) + ':' + pad(m) + ':00').getTime() + row * turn * 60000
}
const rowLabel = (day, start, row, turn) => {
  const d = new Date(slotDate(day, start, row, turn))
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}
const teamsOf = (m) => [m.teamA?.id, m.teamB?.id].filter(Boolean)
// Plantel = equipo + rama. Dos partidos son "seguidos" si comparten plantel: misma rama, o alguno es Mixto (juega cualquiera)
const squadsOf = (m) => [m.teamA?.id, m.teamB?.id].filter(Boolean).map((id) => ({ id, branch: m.branch }))
const sameSquad = (a, b) => a.id === b.id && (a.branch === b.branch || a.branch === 'MIXED' || b.branch === 'MIXED')
const sharesSquad = (ma, mb) => squadsOf(ma).some((x) => squadsOf(mb).some((y) => sameSquad(x, y)))
const byFixture = (a, b) => (a.tournament?.name ?? '').localeCompare(b.tournament?.name ?? '') || phaseCmp(a, b) || String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? ''))

// Deduce con qué hora de inicio y minutos por turno se armó la jornada de ese día (a partir de los partidos ya ubicados)
const gcd = (a, b) => (b ? gcd(b, a % b) : a)
function inferCfg(matches, day, fallbackTurn) {
  const times = [...new Set(matches.filter((m) => m.scheduledAt && m.timeSet !== false && m.court && dayOf(m.scheduledAt) === day).map((m) => new Date(m.scheduledAt).getTime()))].sort((a, b) => a - b)
  if (!times.length) return null
  const d = new Date(times[0])
  const start = pad(d.getHours()) + ':' + pad(d.getMinutes())
  let turn = fallbackTurn
  if (times.length > 1) {
    const g = times.slice(1).reduce((acc, t) => gcd(acc, Math.round((t - times[0]) / 60000)), 0)
    // si los horarios son múltiplos del turno predefinido (hay filas vacías de por medio) se mantiene el predefinido: 120 ≠ turno de 2 horas
    if (g >= 10 && g <= 240) turn = g % DEFAULT_TURN === 0 ? DEFAULT_TURN : g
  }
  return { start, turn }
}

// Grilla inicial: los partidos del día que ya tienen cancha y caen justo en un turno
function buildGrid(matches, day, start, turn) {
  const grid = {}
  let maxCourt = 0
  let maxRow = -1
  matches.forEach((m) => {
    if (!m.scheduledAt || m.timeSet === false || !m.court || m.court > MAX_COURTS || dayOf(m.scheduledAt) !== day) return
    const diff = (new Date(m.scheduledAt).getTime() - slotDate(day, start, 0, turn)) / 60000
    if (diff < 0 || diff % turn !== 0) return
    const row = diff / turn
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
  const [turn, setTurn] = useState(DEFAULT_TURN) // minutos entre el inicio de un partido y el siguiente
  const [courts, setCourts] = useState(2)
  const [turns, setTurns] = useState(8)
  const [venues, setVenues] = useState([])
  const [venueId, setVenueId] = useState('') // sede de la jornada
  const [baseVenue, setBaseVenue] = useState('')
  const [baseCfg, setBaseCfg] = useState({ start: '10:00', turn: DEFAULT_TURN }) // hora de inicio y minutos por turno con que se guardó
  const [noBack, setNoBack] = useState(true) // el autoarmado evita partidos seguidos del mismo plantel
  const [grid, setGrid] = useState({}) // 'cancha|turno' -> id de partido (borrador)
  const [base, setBase] = useState({}) // lo que hay guardado
  const [sel, setSel] = useState(null)
  const [picker, setPicker] = useState(null) // celda vacía tocada: { c, r }
  const [pq, setPq] = useState('')
  const [pAll, setPAll] = useState(false)
  const [q, setQ] = useState('')
  const [fTour, setFTour] = useState('')
  const [fBranch, setFBranch] = useState('')
  const [fWhen, setFWhen] = useState('jornada') // jornada | none | all
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
    api('GET', '/venues').then(setVenues).catch(() => {})
  }, [load])

  const byId = useMemo(() => Object.fromEntries((all ?? []).map((m) => [m.id, m])), [all])

  const dirty = useMemo(() => {
    const ks = new Set([...Object.keys(grid), ...Object.keys(base)])
    return [...ks].some((k) => grid[k] !== base[k]) || venueId !== baseVenue || start !== baseCfg.start || turn !== baseCfg.turn
  }, [grid, base, venueId, baseVenue, start, turn, baseCfg])

  const { modal: leaveModal } = useLeaveGuard(dirty, '', {
    title: '¿Salir sin guardar?',
    message: 'Armaste una jornada y no la guardaste. Si salís, se pierde.',
    stay: 'Quedarme',
    leave: 'Salir',
  })

  // Reconstruye la grilla guardada al cargar los datos o cambiar de día / hora de inicio
  const rebuild = useCallback((d, s, list, t) => {
    const { grid: g, maxCourt, maxRow } = buildGrid(list, d, s, t)
    setGrid(g)
    setBase(g)
    setBaseCfg({ start: s, turn: t })
    setSel(null)
    // sede de la jornada: la que más usan los partidos ya ubicados ese día
    const count = {}
    Object.values(g).forEach((id) => { const v = list.find((m) => m.id === id)?.venue?.id; if (v) count[v] = (count[v] ?? 0) + 1 })
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    setVenueId(top)
    setBaseVenue(top)
    setCourts((c) => Math.max(c, maxCourt))
    setTurns((t) => Math.max(t, maxRow + 1))
  }, [])
  // Al abrir (o cambiar de día) se recupera la jornada guardada con el inicio y el turno con que se armó
  const loadDay = useCallback((d, list, s, t) => {
    const cfg = inferCfg(list, d, t)
    if (cfg) { setStart(cfg.start); setTurn(cfg.turn) }
    rebuild(d, cfg ? cfg.start : s, list, cfg ? cfg.turn : t)
  }, [rebuild])
  useEffect(() => { if (all) loadDay(day, all, start, turn) }, [all]) // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDiscard = async () => !dirty || (await ask({ title: 'Descartar cambios', message: 'Tenés cambios sin guardar. Si seguís, se pierden.', confirmText: 'Descartar', cancelText: 'Volver', danger: true }))
  const changeDay = async (d) => { if (d === day || !(await confirmDiscard())) return; setDay(d); loadDay(d, all ?? [], start, turn) }
  // La hora de inicio y los minutos por turno se cambian libremente: el borrador se conserva y se aplica al guardar
  const changeStart = (s) => { if (s) setStart(s) }
  const changeTurn = (t) => { if (t >= 10 && t <= 240) setTurn(t) }

  // Al elegir una sede se sugiere su cantidad de canchas (se puede ajustar: depende de lo disponible ese día)
  const changeVenue = (id) => {
    setVenueId(id)
    const n = venues.find((v) => v.id === id)?.courts
    if (n) setCourts(Math.min(MAX_COURTS, n))
  }

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
      ;(rowTeams[r] ??= []).push({ k, teams: teamsOf(byId[id]), m: byId[id] })
    })
    Object.entries(rowTeams).forEach(([r, list]) => {
      list.forEach((a) => {
        if (list.some((b) => b !== a && b.teams.some((t) => a.teams.includes(t)))) out[a.k] = 'bad'
        else if ((rowTeams[Number(r) + 1] ?? []).some((b) => sharesSquad(a.m, b.m))) out[a.k] = 'warn'
      })
    })
    return out
  }, [grid, courts, turns, byId])
  const badCount = Object.values(flags).filter((f) => f === 'bad').length

  // Jornada: los partidos del día elegido y, de cada torneo, los de su próxima fecha pendiente
  const nextPhase = useMemo(() => {
    const out = {}
    ;(all ?? []).forEach((m) => {
      const o = m.phase?.order
      if (o == null || !m.tournament?.id) return
      const id = m.tournament.id
      if (out[id] == null || o < out[id]) out[id] = o
    })
    return out
  }, [all])
  const inJornada = useCallback((m) => (
    (m.scheduledAt && dayOf(m.scheduledAt) === day) ||
    (m.phase?.order != null && m.tournament?.id && m.phase.order === nextPhase[m.tournament.id])
  ), [day, nextPhase])

  const pool = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (all ?? [])
      .filter((m) => !placedIds.has(m.id))
      .filter((m) => !fTour || m.tournament?.id === fTour)
      .filter((m) => !fBranch || m.branch === fBranch)
      .filter((m) => fWhen === 'all' || (t && fWhen === 'jornada') || (fWhen === 'none' ? !m.scheduledAt : inJornada(m)))
      .filter((m) => !t || (m.teamA?.name ?? '').toLowerCase().includes(t) || (m.teamB?.name ?? '').toLowerCase().includes(t))
      .sort(byFixture)
  }, [all, placedIds, q, fTour, fBranch, fWhen, inJornada])

  const positionOf = (id) => Object.keys(grid).find((k) => grid[k] === id)

  const tapCell = (c, r) => {
    const k = key(c, r)
    const here = grid[k]
    setOk('')
    if (!sel) { if (here) setSel(here); else { setPq(''); setPAll(false); setPicker({ c, r }) } return }
    if (here === sel) { setSel(null); return }
    const from = positionOf(sel)
    const g = { ...grid }
    if (from) delete g[from]
    g[k] = sel
    if (here && from) g[from] = here // intercambio
    setGrid(g)
    setSel(null)
  }
  const pickerList = useMemo(() => {
    if (!picker) return []
    const t = pq.trim().toLowerCase()
    return (all ?? [])
      .filter((m) => !placedIds.has(m.id))
      .filter((m) => !t || (m.teamA?.name ?? '').toLowerCase().includes(t) || (m.teamB?.name ?? '').toLowerCase().includes(t))
      .filter((m) => pAll || t || inJornada(m))
      .sort(byFixture)
      .slice(0, POOL_STEP)
  }, [picker, all, placedIds, pq, pAll, inJornada])
  const pickFor = (m) => {
    const k = key(picker.c, picker.r)
    setGrid({ ...grid, [k]: m.id })
    setPicker(null)
    setOk('')
  }
  const unplace = (k) => { const g = { ...grid }; delete g[k]; setGrid(g); setSel(null) }

  const autoFill = () => {
    const g = { ...grid }
    const rowMatches = (r) => {
      const list = []
      for (let c = 1; c <= courts; c++) { const m = byId[g[key(c, r)]]; if (m) list.push(m) }
      return list
    }
    const rowTeams = (r) => new Set(rowMatches(r).flatMap(teamsOf))
    const queue = [...pool]
    let placed = 0
    for (let r = 0; r < turns; r++) {
      for (let c = 1; c <= courts; c++) {
        if (g[key(c, r)] || !queue.length) continue
        const used = rowTeams(r)
        const prev = r > 0 ? rowMatches(r - 1) : []
        const next = rowMatches(r + 1)
        const back = (m) => prev.some((p) => sharesSquad(m, p)) || next.some((p) => sharesSquad(m, p))
        // primero uno que no repita equipo en el turno ni juegue seguido; si no hay, solo que no se repita en el turno
        // (con "evitar seguidos" activado el lugar queda vacío para que lo resuelva el admin a mano)
        let i = queue.findIndex((m) => teamsOf(m).every((t) => !used.has(t)) && !back(m))
        if (i < 0 && !noBack) i = queue.findIndex((m) => teamsOf(m).every((t) => !used.has(t)))
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
    const venueChanged = venueId !== baseVenue || start !== baseCfg.start || turn !== baseCfg.turn // también cambia el horario de todos
    Object.entries(grid).forEach(([k, id]) => {
      if (base[k] === id && !venueChanged) return
      const [c, r] = k.split('|').map(Number)
      items.push({ matchId: id, court: c, scheduledAt: new Date(slotDate(day, start, r, turn)).toISOString(), venueId: venueId || null })
    })
    // Los que estaban guardados en la grilla y se sacaron: quedan sin cancha y conservan su horario
    const nowPlaced = new Set(Object.values(grid))
    new Set(Object.values(base)).forEach((id) => {
      if (!nowPlaced.has(id)) items.push({ matchId: id, court: null, scheduledAt: byId[id]?.scheduledAt ?? null })
    })
    if (!items.length) return
    setBusy(true); setErr(''); setErrs([]); setOk('')
    try {
      const r = await api('POST', '/matches/bulk-schedule', { turnMinutes: turn, items })
      await load()
      setOk('Jornada guardada: ' + r.updated + ' partidos actualizados')
    } catch (e) {
      setErr(e.data?.error || e.message)
      setErrs(e.data?.errors ?? [])
    } finally {
      setBusy(false)
    }
  }

  const stepper = (label, value, set, min, max, step = 1) => (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-bg px-2 py-1.5">
      <span className="pl-1 text-xs font-bold text-muted">{label}</span>
      <div className="flex items-center gap-1">
        <button aria-label={'Menos ' + label} disabled={value <= min} onClick={() => set(Math.max(min, value - step))} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 disabled:opacity-30"><Minus size={14} /></button>
        <span className="min-w-6 text-center font-extrabold">{value}</span>
        <button aria-label={'Más ' + label} disabled={value >= max} onClick={() => set(Math.min(max, value + step))} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 disabled:opacity-30"><Plus size={14} /></button>
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
        <label className="block text-xs font-bold text-muted">Sede de la jornada
          <select className={inputCls} value={venueId} onChange={(e) => changeVenue(e.target.value)}>
            <option value="">Sin sede</option>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}{v.courts ? ' · ' + v.courts + (v.courts === 1 ? ' cancha' : ' canchas') : ''}</option>)}
          </select>
          {venues.length === 0 && <span className="mt-1 block font-normal">Todavía no hay sedes: cargalas en <Link to="/admin/sedes" className="font-bold text-accent">Administración › Sedes</Link>.</span>}
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {stepper('Canchas', courts, setCourts, 1, MAX_COURTS)}
          {stepper('Turnos', turns, setTurns, 1, MAX_TURNS)}
          {stepper('Min por turno', turn, changeTurn, 10, 240, TURN_STEP)}
          <label className="flex items-center justify-between gap-2 rounded-xl border border-line bg-bg px-3 py-1.5">
            <span className="text-xs font-bold text-muted">Inicio</span>
            <input type="time" value={start} onChange={(e) => changeStart(e.target.value)} className="bg-transparent py-1 text-right font-extrabold outline-none" />
          </label>
        </div>
        <p className="text-xs">Turno = tiempo entre el inicio de un partido y el siguiente (lo definís vos). Tocá un partido de la lista y después una celda; tocá una celda ocupada para moverla o intercambiarla.</p>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted">Para armarla a mano, tocá una celda vacía y elegí el partido. También podés usar Autoarmar.</p>
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
                  <td className="sticky left-0 z-10 bg-surface px-2 py-1 text-xs font-extrabold">{rowLabel(day, start, r, turn)}</td>
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

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={noBack} onChange={(e) => setNoBack(e.target.checked)} />
          <span>Evitar partidos seguidos al autoarmar <span className="block text-xs text-muted">Si no entra, el lugar queda vacío para completarlo a mano. Una misma rama o Mixto cuenta como el mismo plantel.</span></span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Btn disabled={busy || !pool.length} onClick={autoFill}><Wand2 size={16} /> Autoarmar</Btn>
          <Btn disabled={busy || !Object.keys(grid).length} onClick={clearGrid}>Vaciar tablero</Btn>
        </div>
        <div className={'flex gap-2 ' + (dirty ? 'sticky bottom-20 z-20 rounded-2xl border border-line bg-surface p-2 shadow-lg' : '')}>
          <Btn className="flex-1" disabled={busy || !dirty} onClick={() => { setStart(baseCfg.start); setTurn(baseCfg.turn); rebuild(day, baseCfg.start, all, baseCfg.turn) }}>Descartar</Btn>
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
          {[['jornada', 'Esta jornada'], ['none', 'Sin programación'], ['all', 'Todos']].map(([v, l]) => (
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
                {m.scheduledAt ? new Date(m.scheduledAt).toLocaleString('es-AR', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Sin programación'}
                {m.court ? <span className="block">Cancha {m.court}</span> : null}
              </span>
            </button>
          ))}
          {pool.length === 0 && <p className="text-sm text-muted">{fWhen === 'jornada' ? 'No quedan partidos de esta jornada. Probá "Todos" o buscá por equipo.' : 'No quedan partidos con estos filtros.'}</p>}
          {pool.length > shown && (
            <button onClick={() => setShown((n) => n + POOL_STEP)} className="w-full rounded-xl border border-line py-2.5 text-xs font-extrabold uppercase tracking-wide text-accent">Ver {Math.min(POOL_STEP, pool.length - shown)} más</button>
          )}
        </div>
      </section>
      {picker && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setPicker(null)}>
          <div className="mx-auto flex max-h-[80vh] w-full max-w-xl flex-col gap-2 rounded-t-3xl border border-line bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Cancha {picker.c} · {rowLabel(day, start, picker.r, turn)}</p>
              <button aria-label="Cerrar" onClick={() => setPicker(null)} className="text-muted"><X size={18} /></button>
            </div>
            <input autoFocus className={inputCls} placeholder="Buscar equipo" value={pq} onChange={(e) => setPq(e.target.value)} />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!pAll} onChange={(e) => setPAll(!e.target.checked)} /> Solo partidos de esta jornada
            </label>
            <div className="space-y-1.5 overflow-y-auto">
              {pickerList.map((m) => (
                <button key={m.id} onClick={() => pickFor(m)} className="flex w-full flex-col rounded-xl border border-line bg-surface-2 px-3 py-2 text-left text-sm">
                  <span className="truncate font-bold">{m.teamA?.name ?? 'Por definir'} vs {m.teamB?.name ?? 'Por definir'}</span>
                  <span className="truncate text-[11px] font-semibold uppercase text-muted">{[tournamentName(m), MODALITY[m.modality], BRANCH[m.branch], m.phase?.label].filter(Boolean).join(' · ')}</span>
                </button>
              ))}
              {pickerList.length === 0 && <p className="text-sm text-muted">No hay partidos para ubicar. Probá desmarcar "Solo partidos de esta jornada" o buscar por equipo.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
