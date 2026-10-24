import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeft, Trophy, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import BackLink from '../../components/BackLink'
import { api } from '../../lib/api'
import { BRANCH, MODALITY, FORMAT, TSTATUS, CRITERIA } from '../../lib/format'
import { Btn, Alert, inputCls } from '../../components/ui'
import { useConfirm } from '../../components/ConfirmProvider'
import StandingsView from '../../components/torneo/StandingsView'
import BracketView from '../../components/torneo/BracketView'
import FixtureView from '../../components/torneo/FixtureView'
import BracketEditor, { emptyBracket, fromView } from '../../components/torneo/BracketEditor'

const TABS = [
  ['resumen', 'Resumen'], ['equipos', 'Equipos'], ['estructura', 'Estructura'],
  ['fixture', 'Fixture'], ['tabla', 'Tabla'], ['llave', 'Playoffs'],
]
const letter = (i) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '')

// ───────────── Equipos ─────────────
function TeamsTab({ t, reload, setErr }) {
  const [eligible, setEligible] = useState(null)
  const [sel, setSel] = useState(new Set(t.teams.map((x) => x.teamId)))
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const draft = t.status === 'DRAFT'

  useEffect(() => {
    api('GET', '/tournaments/eligible-teams?branch=' + t.branch + '&modality=' + t.modality).then(setEligible).catch((e) => setErr(e.message))
  }, [t.branch, t.modality, setErr])

  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  async function save() {
    setBusy(true); setErr('')
    try { await api('PUT', '/tournaments/' + t.id + '/teams', { teamIds: [...sel] }); await reload() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const shown = (eligible ?? []).filter((x) => x.name.toLowerCase().includes(q.toLowerCase()))
  const allShown = shown.length > 0 && shown.every((x) => sel.has(x.id))
  const toggleAll = () => setSel((s) => { const n = new Set(s); shown.forEach((x) => (allShown ? n.delete(x.id) : n.add(x.id))); return n })

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Equipos habilitados para {BRANCH[t.branch]} · {MODALITY[t.modality]}. {draft ? 'Elegí los que participan.' : 'Solo se editan en borrador.'}
      </p>
      <input className={inputCls} placeholder="Buscar equipo" value={q} onChange={(e) => setQ(e.target.value)} />
      {draft && shown.length > 0 && (
        <button type="button" onClick={toggleAll} className="text-sm font-bold text-accent">
          {allShown ? 'Quitar todos' : 'Seleccionar todos'}{q ? ' (los buscados)' : ''}
        </button>
      )}
      {eligible === null && <p className="text-muted">Cargando…</p>}
      <div className="max-h-96 space-y-1 overflow-y-auto">
        {shown.map((x) => (
          <label key={x.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <input type="checkbox" disabled={!draft} checked={sel.has(x.id)} onChange={() => toggle(x.id)} />
            {x.name}
          </label>
        ))}
      </div>
      <p className="text-sm font-bold">{sel.size} seleccionados</p>
      {draft && <Btn tone="accent" disabled={busy} onClick={save} className="w-full">Guardar equipos</Btn>}
    </div>
  )
}

// ───────────── Estructura ─────────────
function StructureTab({ t, reload, setErr }) {
  const draft = t.status === 'DRAFT'
  const [stages, setStages] = useState(() =>
    t.stages.map((s) => ({
      key: s.id, name: s.name, type: s.type, phase: s.phase, tier: s.tier ?? '', promotions: s.promotions, relegations: s.relegations,
      teams: s.teams.map((x) => x.teamId),
    }))
  )
  const [zones, setZones] = useState(2)
  const [busy, setBusy] = useState(false)
  const enrolled = t.teams.map((x) => x.team)
  const setStage = (i, patch) => setStages((a) => a.map((s, k) => (k === i ? { ...s, ...patch } : s)))
  const leagueIdx = stages.map((s, i) => (s.type === 'LEAGUE' ? i : -1)).filter((i) => i >= 0)

  function addStage(type) {
    const n = stages.filter((s) => s.type === type).length
    setStages((a) => [...a, {
      key: crypto.randomUUID(), name: type === 'LEAGUE' ? 'Zona ' + letter(n) : n ? 'Llave ' + (n + 1) : 'Playoffs',
      type, phase: type === 'LEAGUE' ? 1 : 2, tier: '', promotions: 0, relegations: 0, teams: [],
    }])
  }
  function autoDistribute() {
    const n = Math.max(1, Math.min(Number(zones) || 1, enrolled.length))
    const shuffled = [...enrolled].sort(() => Math.random() - 0.5)
    const leagues = Array.from({ length: n }, (_, i) => ({
      key: crypto.randomUUID(), name: 'Zona ' + letter(i), type: 'LEAGUE', phase: 1, tier: '', promotions: 0, relegations: 0, teams: [],
    }))
    shuffled.forEach((x, i) => leagues[i % n].teams.push(x.id))
    setStages((a) => [...leagues, ...a.filter((s) => s.type !== 'LEAGUE')])
  }
  function assign(teamId, idx) {
    setStages((a) => a.map((s, k) => {
      if (s.type !== 'LEAGUE') return s
      const rest = s.teams.filter((x) => x !== teamId)
      return { ...s, teams: k === idx ? [...rest, teamId] : rest }
    }))
  }
  async function save() {
    setBusy(true); setErr('')
    try {
      await api('PUT', '/tournaments/' + t.id + '/stages', {
        stages: stages.map((s) => ({
          name: s.name.trim(), type: s.type, phase: Number(s.phase), tier: s.tier === '' ? null : Number(s.tier),
          promotions: Number(s.promotions) || 0, relegations: Number(s.relegations) || 0,
          teams: s.type === 'LEAGUE' ? s.teams : [],
        })),
      })
      await reload()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const where = (teamId) => stages.findIndex((s) => s.type === 'LEAGUE' && s.teams.includes(teamId))

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Zonas de liga (con ascensos y descensos) y llaves de eliminación. {draft ? '' : 'La estructura solo se edita en borrador.'}
      </p>
      {draft && (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-surface-2 p-3">
          <label className="w-24 text-xs text-muted">Zonas
            <input type="number" min="1" className={inputCls} value={zones} onChange={(e) => setZones(e.target.value)} />
          </label>
          <Btn onClick={autoDistribute}>Repartir equipos al azar</Btn>
          <Btn onClick={() => addStage('LEAGUE')}><Plus size={16} /> Zona</Btn>
          <Btn onClick={() => addStage('KNOCKOUT')}><Plus size={16} /> Llave</Btn>
        </div>
      )}
      {stages.map((s, i) => (
        <div key={s.key} className="space-y-3 rounded-3xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2">
            <input disabled={!draft} className={inputCls} value={s.name} onChange={(e) => setStage(i, { name: e.target.value })} />
            <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs font-bold">{s.type === 'LEAGUE' ? 'Zona' : 'Llave'}</span>
            {draft && <button aria-label="Quitar" onClick={() => setStages((a) => a.filter((_, k) => k !== i))}><Trash2 size={18} className="text-danger" /></button>}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs text-muted [&>*]:min-w-0 sm:grid-cols-4">
            <label>Fase<input disabled={!draft} type="number" min="1" className={inputCls} value={s.phase} onChange={(e) => setStage(i, { phase: e.target.value })} /></label>
            <label>Categoría
              <select disabled={!draft} className={inputCls} value={s.tier} onChange={(e) => setStage(i, { tier: e.target.value })}>
                <option value="">—</option>
                {Array.from({ length: 26 }, (_, k) => <option key={k} value={k + 1}>{String.fromCharCode(65 + k)}</option>)}
              </select>
            </label>
            {s.type === 'LEAGUE' && (
              <>
                <label>Ascienden<input disabled={!draft} type="number" min="0" className={inputCls} value={s.promotions} onChange={(e) => setStage(i, { promotions: e.target.value })} /></label>
                <label>Descienden<input disabled={!draft} type="number" min="0" className={inputCls} value={s.relegations} onChange={(e) => setStage(i, { relegations: e.target.value })} /></label>
              </>
            )}
          </div>
          {s.type === 'LEAGUE' && <p className="text-xs text-muted">{s.teams.length} equipos</p>}
        </div>
      ))}
      {leagueIdx.length > 0 && (
        <div className="space-y-1 rounded-3xl border border-line bg-surface p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Equipos por zona</p>
          {enrolled.map((x) => (
            <div key={x.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              <select disabled={!draft} className="rounded-xl border border-line bg-bg px-2 py-1" value={where(x.id)} onChange={(e) => assign(x.id, Number(e.target.value))}>
                <option value={-1}>Sin zona</option>
                {leagueIdx.map((i) => <option key={i} value={i}>{stages[i].name}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      {draft && <Btn tone="accent" disabled={busy} onClick={save} className="w-full">Guardar estructura</Btn>}
    </div>
  )
}

// ───────────── Fixture ─────────────
function FixtureTab({ t, setErr }) {
  const ask = useConfirm()
  const [days, setDays] = useState(null)
  const [tick, setTick] = useState(0)
  const [opt, setOpt] = useState({ startDate: '', schedule: 'interval', intervalDays: 7, doubleRound: false, shuffle: true })
  const [busy, setBusy] = useState(false)
  const leagues = t.stages.filter((s) => s.type === 'LEAGUE')
  const hasFixture = (id) => (days ?? []).some((d) => d.stage.id === id)

  async function draw(stage) {
    setBusy(true); setErr('')
    try {
      await api('POST', '/tournaments/' + t.id + '/stages/' + stage.id + '/fixture', {
        shuffle: opt.shuffle, doubleRound: opt.doubleRound, intervalDays: Number(opt.intervalDays) || 7, schedule: opt.schedule,
        startDate: opt.startDate ? opt.startDate + 'T15:00:00.000Z' : undefined,
      })
      setTick((x) => x + 1)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  async function drop(stage) {
    if (!(await ask({ title: 'Eliminar fixture', message: '¿Eliminar el fixture de ' + stage.name + '?', confirmText: 'Eliminar', danger: true }))) return
    setErr('')
    try { await api('DELETE', '/tournaments/' + t.id + '/stages/' + stage.id + '/fixture'); setTick((x) => x + 1) } catch (e) { setErr(e.message) }
  }

  return (
    <div className="space-y-4">
      {leagues.length === 0 && <p className="text-muted">No hay zonas de liga. Definilas en Estructura.</p>}
      {leagues.length > 0 && days !== null && (
        <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
          <p className="text-sm font-bold">Sorteo todos contra todos</p>
          <div className="grid grid-cols-2 gap-3 text-xs text-muted [&>*]:min-w-0">
            <label>{opt.schedule === 'interval' ? 'Primera fecha' : opt.schedule === 'weekend' ? 'Sábado (primer día)' : 'Día de juego'}<input type="date" className={inputCls} value={opt.startDate} onChange={(e) => setOpt({ ...opt, startDate: e.target.value })} /></label>
            <label>Cuándo se juega
              <select className={inputCls} value={opt.schedule} onChange={(e) => setOpt({ ...opt, schedule: e.target.value })}>
                <option value="interval">Cada tantos días</option>
                <option value="sameDay">Todo el mismo día</option>
                <option value="weekend">Fin de semana (sáb y dom)</option>
              </select>
            </label>
            {opt.schedule === 'interval' && (
              <label>Días entre fechas<input type="number" min="1" className={inputCls} value={opt.intervalDays} onChange={(e) => setOpt({ ...opt, intervalDays: e.target.value })} /></label>
            )}
          </div>
          {opt.schedule === 'sameDay' && <p className="text-xs text-muted">Todas las fechas quedan en el mismo día; la hora y la cancha se asignan después.</p>}
          {opt.schedule === 'weekend' && <p className="text-xs text-muted">La primera mitad de las fechas va el sábado y el resto el domingo.</p>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={opt.doubleRound} onChange={(e) => setOpt({ ...opt, doubleRound: e.target.checked })} /> Ida y vuelta</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={opt.shuffle} onChange={(e) => setOpt({ ...opt, shuffle: e.target.checked })} /> Sortear el orden</label>
          {leagues.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <span className="flex-1 text-sm font-semibold">{s.name}</span>
              {hasFixture(s.id)
                ? <Btn tone="danger" onClick={() => drop(s)}>Eliminar fixture</Btn>
                : <Btn tone="accent" disabled={busy || t.status === 'FINISHED'} onClick={() => draw(s)}>Sortear</Btn>}
            </div>
          ))}
        </div>
      )}
      <FixtureView tournamentId={t.id} admin base="/admin/partidos/" reloadKey={tick} onLoaded={setDays} />
    </div>
  )
}

// ───────────── Llave ─────────────
function BracketBuilder({ t, stage, onDone, setErr }) {
  const leagues = t.stages.filter((s) => s.type === 'LEAGUE')
  const [source, setSource] = useState(leagues.length ? 'standings' : 'teams')
  const [order, setOrder] = useState(t.teams.map((x) => x.team))
  const [top, setTop] = useState(2)
  const [o, setO] = useState({ shuffle: false, keepTop: 0, thirdPlace: false, pairing: 'auto', startDate: '', intervalDays: 7, ladder: false })
  const [entry, setEntry] = useState({})
  const [busy, setBusy] = useState(false)

  const move = (i, d) => setOrder((a) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j], b[i]]; return b })

  async function build() {
    setBusy(true); setErr('')
    try {
      const body = {
        replace: true, shuffle: o.shuffle, keepTop: Number(o.keepTop) || 0, thirdPlace: o.thirdPlace,
        intervalDays: Number(o.intervalDays) || 7,
        startDate: o.startDate ? o.startDate + 'T15:00:00.000Z' : undefined,
        ...(o.pairing !== 'auto' ? { pairing: o.pairing } : {}),
      }
      if (source === 'standings') body.fromStandings = leagues.map((s) => ({ stageId: s.id, top: Number(top) }))
      else body.teamIds = order.map((x) => x.id)
      if (o.ladder) {
        const er = {}
        for (const x of order) er[x.id] = Number(entry[x.id]) || 1
        body.entryRounds = er
      }
      await api('POST', '/tournaments/' + t.id + '/stages/' + stage.id + '/bracket', body)
      onDone()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <p className="text-sm font-bold">Armar la llave</p>
      <div className="flex gap-2">
        {leagues.length > 0 && <Btn tone={source === 'standings' ? 'accent' : 'base'} onClick={() => setSource('standings')}>Desde la tabla</Btn>}
        <Btn tone={source === 'teams' ? 'accent' : 'base'} onClick={() => setSource('teams')}>Elegir equipos y orden</Btn>
      </div>
      {source === 'standings' ? (
        <label className="block text-xs text-muted">Clasifican los primeros N de cada zona
          <input type="number" min="1" className={inputCls} value={top} onChange={(e) => setTop(e.target.value)} />
        </label>
      ) : (
        <div className="space-y-1">
          <p className="text-xs text-muted">El orden es la siembra (el primero es el mejor).{o.ladder ? ' Elegí en qué ronda entra cada uno.' : ''}</p>
          {order.map((x, i) => (
            <div key={x.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="w-5 font-bold text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              {o.ladder && (
                <select className="rounded-lg border border-line bg-bg px-1 py-0.5" value={entry[x.id] ?? 1} onChange={(e) => setEntry({ ...entry, [x.id]: e.target.value })}>
                  {[1, 2, 3, 4, 5, 6].map((r) => <option key={r} value={r}>Ronda {r}</option>)}
                </select>
              )}
              <button type="button" onClick={() => move(i, -1)}><ChevronUp size={18} /></button>
              <button type="button" onClick={() => move(i, 1)}><ChevronDown size={18} /></button>
              <button type="button" onClick={() => setOrder((a) => a.filter((y) => y.id !== x.id))}><Trash2 size={16} className="text-danger" /></button>
            </div>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={o.shuffle} onChange={(e) => setO({ ...o, shuffle: e.target.checked })} /> Sortear el cuadro</label>
      {o.shuffle && (
        <label className="block text-xs text-muted">Cabezas de serie que no se sortean
          <input type="number" min="0" className={inputCls} value={o.keepTop} onChange={(e) => setO({ ...o, keepTop: e.target.value })} />
        </label>
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={o.thirdPlace} onChange={(e) => setO({ ...o, thirdPlace: e.target.checked })} /> Partido por el tercer puesto</label>
      {source === 'teams' && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={o.ladder} onChange={(e) => setO({ ...o, ladder: e.target.checked })} /> Equipos que entran en rondas distintas</label>
      )}
      <label className="block text-xs text-muted">Cruces
        <select className={inputCls} value={o.pairing} onChange={(e) => setO({ ...o, pairing: e.target.value })}>
          <option value="auto">Automático (1.º vs último)</option>
          <option value="fold">1.º vs último, 2.º vs anteúltimo</option>
          <option value="adjacent">En el orden: 1 vs 2, 3 vs 4…</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3 text-xs text-muted [&>*]:min-w-0">
        <label>Primera ronda<input type="date" className={inputCls} value={o.startDate} onChange={(e) => setO({ ...o, startDate: e.target.value })} /></label>
        <label>Días entre rondas<input type="number" min="1" className={inputCls} value={o.intervalDays} onChange={(e) => setO({ ...o, intervalDays: e.target.value })} /></label>
      </div>
      <Btn tone="accent" disabled={busy} onClick={build} className="w-full">Armar llave</Btn>
    </div>
  )
}

function BracketsSection({ t, setErr }) {
  const ask = useConfirm()
  const [tick, setTick] = useState(0)
  const [counts, setCounts] = useState({})
  const [editor, setEditor] = useState(null) // { id, create, initial }
  const [size, setSize] = useState(4)
  const [third, setThird] = useState(false)
  const knockouts = t.stages.filter((s) => s.type === 'KNOCKOUT')

  useEffect(() => {
    knockouts.forEach((s) =>
      api('GET', '/tournaments/' + t.id + '/stages/' + s.id + '/bracket')
        .then((d) => setCounts((c) => ({ ...c, [s.id]: d.totalMatches })))
        .catch(() => {})
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, t.id, knockouts.map((s) => s.id).join()])

  async function drop(s) {
    if (!(await ask({ title: 'Eliminar llave', message: '¿Eliminar la llave de ' + s.name + '?', confirmText: 'Eliminar', danger: true }))) return
    setErr('')
    try { await api('DELETE', '/tournaments/' + t.id + '/stages/' + s.id + '/bracket'); setTick((x) => x + 1) } catch (e) { setErr(e.message) }
  }

  async function startEdit(st) {
    setErr('')
    try {
      const d = await api('GET', '/tournaments/' + t.id + '/stages/' + st.id + '/bracket')
      setEditor({ id: st.id, create: false, initial: fromView(d) })
    } catch (e) { setErr(e.message) }
  }
  const startCreate = (st) => setEditor({ id: st.id, create: true, initial: emptyBracket(Number(size), third) })
  const saved = () => { setEditor(null); setTick((x) => x + 1) }

  if (!knockouts.length) return null
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted">Llaves de eliminación: acá se arman los cruces. Los resultados se cargan desde Fixture y se ven en Playoffs.</p>
      {knockouts.map((s) => (
        <div key={s.id} className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-xs font-bold uppercase tracking-widest text-muted">{s.name}</p>
            {counts[s.id] > 0 && t.status !== 'FINISHED' && editor?.id !== s.id && <Btn onClick={() => startEdit(s)}>Editar cruces</Btn>}
            {counts[s.id] > 0 && editor?.id !== s.id && <Btn tone="danger" onClick={() => drop(s)}>Eliminar llave</Btn>}
          </div>
          {editor?.id === s.id ? (
            <BracketEditor t={t} stage={s} initial={editor.initial} create={editor.create} setErr={setErr} onSaved={saved} onCancel={() => setEditor(null)} />
          ) : (
            <>
              {counts[s.id] === 0 && t.status !== 'FINISHED' && (
                <>
                  <div className="space-y-3 rounded-3xl border border-accent/40 bg-surface p-4">
                    <p className="text-sm font-bold">Definir los Playoffs <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-black">Recomendado</span></p>
                    <p className="text-xs text-muted">Arrancás con un cuadro vacío y elegís vos cada cruce, por ejemplo 1.º vs 4.º según la tabla.</p>
                    <label className="block text-xs text-muted">Primera ronda
                      <select className={inputCls} value={size} onChange={(e) => setSize(e.target.value)}>
                        <option value={1}>Final</option>
                        <option value={2}>Semifinales</option>
                        <option value={4}>Cuartos de final</option>
                        <option value={8}>Octavos de final</option>
                        <option value={16}>16avos de final</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={third} onChange={(e) => setThird(e.target.checked)} /> Partido por el tercer puesto</label>
                    <Btn tone="accent" onClick={() => startCreate(s)} className="w-full">Definir playoffs</Btn>
                  </div>
                  <details className="rounded-3xl border border-line bg-surface p-4">
                    <summary className="cursor-pointer text-sm font-bold">Opciones avanzadas: armado automático</summary>
                    <div className="mt-3">
                      <BracketBuilder t={t} stage={s} setErr={setErr} onDone={() => setTick((x) => x + 1)} />
                    </div>
                  </details>
                </>
              )}
              <BracketView tournamentId={t.id} stageId={s.id} base="/admin/partidos/" reloadKey={tick} />
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function BracketTab({ t, goStructure }) {
  const knockouts = t.stages.filter((s) => s.type === 'KNOCKOUT')
  if (!knockouts.length) return <p className="text-muted">Este torneo no tiene llaves. Se agregan en Estructura.</p>
  return (
    <div className="space-y-6">
      {knockouts.map((s) => (
        <div key={s.id} className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">{s.name}</p>
          <BracketView tournamentId={t.id} stageId={s.id} base="/admin/partidos/" />
        </div>
      ))}
      <button onClick={goStructure} className="text-sm font-bold text-accent">Editar cruces en Estructura</button>
    </div>
  )
}

// ───────────── Resumen ─────────────
function SummaryTab({ t, reload, setErr, setMsg }) {
  const ask = useConfirm()
  const [champ, setChamp] = useState('')
  const [busy, setBusy] = useState(false)
  const [warn, setWarn] = useState('')

  // Avisa si el campeón no se va a poder definir solo (sin playoffs armados o con la final sin terminar)
  useEffect(() => {
    setWarn('')
    if (t.status !== 'ACTIVE' || t.format === 'LEAGUE') return // en liga el campeón sale de la tabla
    const ko = t.stages.filter((x) => x.type === 'KNOCKOUT')
    if (!ko.length) return
    const top = Math.max(...ko.map((x) => x.phase))
    const last = ko.filter((x) => x.phase === top)
    if (last.length !== 1) { setWarn('Hay más de una llave en la última fase: elegí al campeón a mano.'); return }
    api('GET', '/tournaments/' + t.id + '/stages/' + last[0].id + '/bracket').then((d) => {
      if (!d.totalMatches) { setWarn('Todavía no definiste los playoffs: si cerrás ahora, elegí al campeón a mano.'); return }
      const final = d.rounds[d.rounds.length - 1].matches.find((m) => m.slot === 1)
      if (!final || final.status !== 'FINISHED') setWarn('La final todavía no terminó: si cerrás ahora, elegí al campeón a mano.')
    }).catch(() => {})
  }, [t.id, t.status])

  async function activate() {
    setBusy(true); setErr('')
    try { await api('POST', '/tournaments/' + t.id + '/activate', {}); setMsg('Torneo activado'); await reload() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  async function close(force) {
    if (!(await ask({ title: 'Cerrar torneo', message: 'Se congela la tabla final y no se podrá modificar. ¿Cerrar "' + t.name + '"?', confirmText: 'Cerrar' }))) return
    setBusy(true); setErr('')
    try {
      const r = await api('POST', '/tournaments/' + t.id + '/close', { ...(champ ? { championId: champ } : {}), ...(force ? { force: true } : {}) })
      setMsg('Torneo cerrado' + (r.unresolvedTies ? ' · empates sin resolver: ' + r.unresolvedTies : ''))
      await reload()
    } catch (e) {
      setErr(e.message + (e.data?.pending ? ' (podés cerrarlo igual desde “Cerrar con pendientes”)' : ''))
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1 rounded-3xl border border-line bg-surface p-4 text-sm">
        <p><span className="text-muted">Formato:</span> {FORMAT[t.format]}</p>
        <p><span className="text-muted">Rama / modalidad:</span> {BRANCH[t.branch]} · {MODALITY[t.modality]}</p>
        <p><span className="text-muted">Puntos:</span> victoria {t.pointsWin} · empate {t.pointsDraw} · derrota {t.pointsLoss}</p>
        <p><span className="text-muted">Desempates:</span> {t.tiebreakers.map((x) => CRITERIA[x.criterion]).join(' → ')}</p>
        <p><span className="text-muted">Equipos:</span> {t.teams.length}</p>
        {t.champion && <p className="flex items-center gap-1 font-bold"><Trophy size={16} /> Campeón: {t.champion.name}</p>}
      </div>
      {t.status === 'DRAFT' && (
        <div className="space-y-2">
          <p className="text-sm text-muted">Para activar: equipos inscriptos, estructura definida y partidos generados (fixture y llaves).</p>
          <Btn tone="accent" disabled={busy} onClick={activate} className="w-full">Activar torneo</Btn>
        </div>
      )}
      {t.status === 'ACTIVE' && (
        <div className="space-y-2 rounded-3xl border border-line bg-surface p-4">
          <p className="text-sm font-bold">Cerrar torneo</p>
          <p className="text-xs text-muted">Congela la tabla final (con ascensos y descensos) y registra al campeón. Si no se define solo, elegilo acá.</p>
          {warn && <p className="text-xs font-bold text-warn">{warn}</p>}
          <select className={inputCls} value={champ} onChange={(e) => setChamp(e.target.value)}>
            <option value="">Campeón automático</option>
            {t.teams.map((x) => <option key={x.teamId} value={x.teamId}>{x.team.name}</option>)}
          </select>
          <Btn tone="accent" disabled={busy} onClick={() => close(false)} className="w-full">Cerrar torneo</Btn>
          <Btn disabled={busy} onClick={() => close(true)} className="w-full">Cerrar con partidos pendientes</Btn>
        </div>
      )}
    </div>
  )
}

export default function TorneoAdminPage() {
  const { id } = useParams()
  const [t, setT] = useState(null)
  const [tab, setTab] = useState('resumen')
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [pausing, setPausing] = useState(false)
  const askPause = useConfirm()

  const load = useCallback(() => api('GET', '/tournaments/' + id).then(setT).catch((e) => setErr(e.message)), [id])
  useEffect(() => { load() }, [load])

  async function togglePause() {
    const willPause = !t.pausedAt
    const ok = await askPause(willPause
      ? { title: 'Pausar torneo', message: 'El torneo y todos sus partidos (programados, habilitados, en vivo y finalizados) van a desaparecer para todos los usuarios, menos la organización. No se borra nada y podés reanudarlo cuando quieras.', confirmText: 'Pausar torneo', danger: true }
      : { title: 'Reanudar torneo', message: 'El torneo y sus partidos vuelven a verse para todos, tal cual estaban.', confirmText: 'Reanudar torneo' })
    if (!ok) return
    setPausing(true); setErr('')
    try {
      const r = await api('POST', '/tournaments/' + id + (willPause ? '/pause' : '/resume'))
      setMsg(willPause ? 'Torneo pausado: ' + r.hiddenMatches + ' partidos ocultos' : 'Torneo reanudado: ' + r.restoredMatches + ' partidos visibles de nuevo')
      await load()
    } catch (e) { setErr(e.message) } finally { setPausing(false) }
  }

  if (!t) return err ? <Alert onClose={() => setErr('')}>{err}</Alert> : <p className="text-muted">Cargando…</p>
  const st = TSTATUS[t.status]

  return (
    <div className="space-y-4">
      <BackLink to="/admin/torneos" className="flex items-center gap-1 text-sm text-muted"><ArrowLeft size={16} /> Torneos</BackLink>
      <div>
        <h1 className="text-xl font-extrabold">{t.name}{t.edition ? ' · ' + t.edition : ''}</h1>
        <p className="flex items-center gap-2 text-sm text-muted">{t.year} <span className={'rounded-full px-2 py-0.5 text-xs font-bold uppercase ' + st.cls}>{st.label}</span></p>
      </div>
      {t.pausedAt && (
        <div className="rounded-2xl border box-warn px-4 py-3 text-sm font-bold text-warn">
          Torneo pausado: nadie lo ve salvo la organización. Mientras está pausado sus partidos no se muestran en la app; reanudalo para editarlos.
        </div>
      )}
      <button
        disabled={pausing}
        onClick={togglePause}
        className={'w-full rounded-2xl border px-4 py-3 text-sm font-extrabold disabled:opacity-50 ' + (t.pausedAt ? 'border-transparent bg-accent text-black' : 'border-line bg-surface')}
      >
        {pausing ? '...' : t.pausedAt ? 'Reanudar torneo' : 'Pausar torneo'}
      </button>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {msg && <Alert tone="ok" onClose={() => setMsg('')}>{msg}</Alert>}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={'shrink-0 rounded-full px-4 py-2 text-sm font-bold ' + (tab === k ? 'bg-accent text-black' : 'border border-line bg-surface')}>{label}</button>
        ))}
      </div>
      {tab === 'resumen' && <SummaryTab t={t} reload={load} setErr={setErr} setMsg={setMsg} />}
      {tab === 'equipos' && <TeamsTab t={t} reload={load} setErr={setErr} />}
      {tab === 'estructura' && (
        <div className="space-y-6">
          <StructureTab key={t.stages.map((s) => s.id).join()} t={t} reload={load} setErr={setErr} />
          <BracketsSection t={t} setErr={setErr} />
        </div>
      )}
      {tab === 'fixture' && <FixtureTab t={t} setErr={setErr} />}
      {tab === 'llave' && <BracketTab t={t} goStructure={() => setTab('estructura')} />}
      {tab === 'tabla' && <StandingsView tournamentId={t.id} finished={t.status === 'FINISHED'} />}
    </div>
  )
}
