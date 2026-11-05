import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { socket } from '../../sockets/socket'
import { Btn, Alert, inputCls } from '../ui'
import { useConfirm } from '../ConfirmProvider'
import { MatchRow } from './FixtureView'

// Zonas de liga donde juegan los dos equipos (para poder sumar el partido a su tabla)
function commonZones(t, teamAId, teamBId) {
  if (!teamAId || !teamBId) return []
  return t.stages.filter((s) => s.type === 'LEAGUE'
    && s.teams.some((x) => x.teamId === teamAId) && s.teams.some((x) => x.teamId === teamBId))
}

// Elige a qué zona y fecha entra el partido para sumar a la tabla
function StandingsPicker({ t, days, teamAId, teamBId, value, onChange }) {
  const zones = commonZones(t, teamAId, teamBId)
  const stageId = zones.some((z) => z.id === value.stageId) ? value.stageId : zones[0]?.id ?? ''
  const dates = (days ?? []).filter((d) => d.stage.id === stageId)

  // Si cambió la zona elegida (por cambiar de equipos) se avisa al formulario
  useEffect(() => {
    if (stageId !== value.stageId) onChange({ stageId, matchdayId: 'new' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId])

  if (!teamAId || !teamBId) return <p className="text-xs text-muted">Elegí los dos equipos para sumar el partido a la tabla.</p>
  if (!zones.length) return <p className="text-xs text-danger">Los dos equipos tienen que jugar en la misma zona de liga para sumar a la tabla.</p>
  return (
    <div className="grid grid-cols-2 gap-3 text-xs text-muted [&>*]:min-w-0">
      <label>Zona
        <select className={inputCls} value={stageId} onChange={(e) => onChange({ stageId: e.target.value, matchdayId: 'new' })}>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </label>
      <label>Fecha
        <select className={inputCls} value={value.matchdayId} onChange={(e) => onChange({ stageId, matchdayId: e.target.value })}>
          <option value="new">Fecha nueva</option>
          {dates.map((d) => <option key={d.id} value={d.id}>Fecha {d.number}</option>)}
        </select>
      </label>
    </div>
  )
}

// Carga de partidos a mano, en un solo formulario: zona → equipos de esa zona → fecha → día. Pensado para armar un fixture propio o cargar un torneo ya jugado.
export function ManualMatchForm({ t, days, onDone, setErr }) {
  const ask = useConfirm()
  const leagues = t.stages.filter((s) => s.type === 'LEAGUE')
  const [stageId, setStageId] = useState(leagues[0]?.id ?? '')
  const [matchdayId, setMatchdayId] = useState('new')
  const [f, setF] = useState({ teamAId: '', teamBId: '', court: '', day: '', time: '', counts: true })
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState('')
  const pickLast = useRef(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  const stage = leagues.find((s) => s.id === stageId)
  const teams = t.teams.map((x) => x.team).filter((tm) => !f.counts || !stage || stage.teams.some((z) => z.teamId === tm.id))
  const fechas = (days ?? []).filter((d) => d.stage.id === stageId)

  // Después de crear una fecha nueva, queda elegida para seguir cargando partidos en ella
  useEffect(() => {
    if (!pickLast.current) return
    pickLast.current = false
    if (fechas.length) setMatchdayId(fechas[fechas.length - 1].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  function pickFecha(id) {
    setMatchdayId(id)
    const d = fechas.find((x) => x.id === id)
    if (d?.date) set('day', String(d.date).slice(0, 10))
  }

  async function submit(e) {
    e.preventDefault()
    if (!f.teamAId || !f.teamBId) { setErr('Elegí los dos equipos.'); return }
    if (f.teamAId === f.teamBId) { setErr('Los dos equipos son el mismo.'); return }
    setBusy(true); setErr(''); setOk('')
    const body = {
      tournamentId: t.id,
      branch: t.branch,
      modality: t.modality,
      court: f.court === '' ? null : Number(f.court),
      scheduledAt: f.day ? (f.time ? new Date(f.day + 'T' + f.time + ':00').toISOString() : f.day + 'T15:00:00.000Z') : null,
      timeSet: !!(f.day && f.time),
      teamAId: f.teamAId,
      teamBId: f.teamBId,
      ...(f.counts ? { countsInStandings: true, stageId, matchdayId } : {}),
    }
    try {
      try {
        await api('POST', '/matches', body)
      } catch (er) {
        // Cruce que ya existe en la zona: se puede agregar igual si es ida y vuelta
        if (er.data?.code !== 'REPEATED_PAIR' || !(await ask({ title: 'Cruce repetido', message: er.message, confirmText: 'Agregar igual' }))) throw er
        await api('POST', '/matches', { ...body, force: true })
      }
      const nombres = (id) => teams.find((x) => x.id === id)?.name ?? ''
      setOk('Agregado: ' + nombres(f.teamAId) + ' vs ' + nombres(f.teamBId))
      if (matchdayId === 'new') pickLast.current = true
      setF((s) => ({ ...s, teamAId: '', teamBId: '', court: '', time: '' }))
      await onDone()
    } catch (er) { setErr(er.message) } finally { setBusy(false) }
  }

  if (!leagues.length) return <p className="text-sm text-muted">Primero definí las zonas en Estructura.</p>

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-muted">
        Cargá los partidos de a uno. La fecha se crea sola si elegís "Fecha nueva", y queda elegida para cargar los siguientes. Un equipo no puede jugar dos veces en la misma fecha, pero sí varias fechas el mismo día. El día, la hora y la cancha son opcionales: ponelos solo si los tenés.
      </p>
      <div className="grid grid-cols-2 gap-3 text-xs text-muted [&>*]:min-w-0">
        {f.counts && (
          <>
            <label>Zona
              <select className={inputCls} value={stageId} onChange={(e) => { setStageId(e.target.value); setMatchdayId('new'); setF((s) => ({ ...s, teamAId: '', teamBId: '' })) }}>
                {leagues.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </label>
            <label>Fecha
              <select className={inputCls} value={matchdayId} onChange={(e) => pickFecha(e.target.value)}>
                <option value="new">Fecha nueva (la {fechas.length + 1})</option>
                {fechas.map((d) => <option key={d.id} value={d.id}>Fecha {d.number}</option>)}
              </select>
            </label>
          </>
        )}
        {[['teamAId', 'Equipo A'], ['teamBId', 'Equipo B']].map(([k, l]) => (
          <label key={k}>{l}
            <select className={inputCls} value={f[k]} onChange={(e) => set(k, e.target.value)}>
              <option value="">Elegir…</option>
              {teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        ))}
        <label>Día (opcional)
          <input type="date" className={inputCls} value={f.day} onChange={(e) => set('day', e.target.value)} />
        </label>
        <label>Hora (opcional)
          <input type="time" disabled={!f.day} className={inputCls} value={f.time} onChange={(e) => set('time', e.target.value)} />
        </label>
        <label>Cancha (opcional)
          <input type="number" min="1" placeholder="Opcional" className={inputCls} value={f.court} onChange={(e) => set('court', e.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.counts} onChange={(e) => set('counts', e.target.checked)} /> Suma a la tabla de posiciones
      </label>
      {!f.counts && <p className="text-xs text-muted">Sin sumar, el partido se muestra aparte en "Fuera del fixture" y no cuenta en la tabla.</p>}
      {ok && <p className="text-xs font-bold text-live">{ok}</p>}
      <Btn type="submit" tone="accent" disabled={busy} className="w-full">Agregar partido</Btn>
    </form>
  )
}

// Un partido fuera del fixture, con la opción de sumarlo a la tabla (solo organización, y solo si todavía no se jugó)
function AdminRow({ m, t, days, base, onChanged, setErr }) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState({ stageId: '', matchdayId: 'new' })
  const [busy, setBusy] = useState(false)
  const editable = m.status === 'SCHEDULED' || m.status === 'READY'
  const zonesOk = commonZones(t, m.teamA?.id, m.teamB?.id).length > 0

  async function count() {
    setBusy(true); setErr('')
    try {
      await api('PATCH', '/matches/' + m.id, { countsInStandings: true, stageId: place.stageId, matchdayId: place.matchdayId })
      setOpen(false)
      await onChanged()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-2">
      <MatchRow m={m} base={base} />
      {editable && (
        <div className="px-1">
          {!open
            ? <button type="button" onClick={() => setOpen(true)} className="text-xs font-bold text-accent">Sumar a la tabla…</button>
            : (
              <div className="space-y-2 rounded-2xl border border-line p-3">
                <StandingsPicker t={t} days={days} teamAId={m.teamA?.id} teamBId={m.teamB?.id} value={place} onChange={setPlace} />
                <div className="flex gap-2">
                  <Btn tone="accent" onClick={count} disabled={busy || !zonesOk}>Sumar</Btn>
                  <Btn onClick={() => setOpen(false)}>Cancelar</Btn>
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  )
}

// Partidos del torneo que no son del fixture ni de las llaves. Público: solo si hay. Organización: con alta y sumar a la tabla.
// t y days (calendario del fixture) solo hacen falta con admin; onChanged refresca el fixture cuando un partido pasa a la tabla.
export default function ExtraMatchesView({ tournamentId, t, days, admin = false, base = '/partido/', reloadKey, onChanged, onLoaded }) {
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')

  const load = () => api('GET', '/tournaments/' + tournamentId + '/extra-matches')
    .then((d) => { setList(d); onLoaded?.(d) })
    .catch((e) => setErr(e.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [tournamentId, reloadKey])

  // Se actualiza solo cuando cambia un partido (un instante de espera para agrupar cambios seguidos)
  useEffect(() => {
    let timer
    const onUpdated = () => { clearTimeout(timer); timer = setTimeout(load, 1200) }
    socket.emit('matches:subscribe')
    socket.on('match:updated', onUpdated)
    return () => { clearTimeout(timer); socket.off('match:updated', onUpdated); socket.emit('matches:unsubscribe') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])

  async function changed() { await load(); await onChanged?.() }

  if (!list) return err ? <p className="text-danger">{err}</p> : <p className="text-muted">Cargando…</p>
  if (!admin && !list.length) return <p className="text-muted">No hay partidos fuera del fixture.</p>

  return (
    <div className="space-y-3">
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {list.length > 0 && (
        <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
          <p className="text-sm font-bold">Fuera del fixture<span className="ml-2 font-normal text-muted">no suman a la tabla</span></p>
          <div className="space-y-2">
            {list.map((m) => admin
              ? <AdminRow key={m.id} m={m} t={t} days={days} base={base} onChanged={changed} setErr={setErr} />
              : <MatchRow key={m.id} m={m} base={base} />)}
          </div>
        </div>
      )}
    </div>
  )
}
