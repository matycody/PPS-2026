import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { socket } from '../../sockets/socket'
import { Btn, Alert, inputCls } from '../ui'
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

// Alta de un partido del torneo, en cualquier momento (aunque ya esté en curso): la organización decide si suma a la tabla
function AddMatchForm({ t, days, onDone, setErr }) {
  const teams = t.teams.map((x) => x.team)
  const [f, setF] = useState({ teamAId: '', teamBId: '', court: '', scheduledAt: '', counts: false })
  const [place, setPlace] = useState({ stageId: '', matchdayId: 'new' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      await api('POST', '/matches', {
        tournamentId: t.id,
        branch: t.branch,
        modality: t.modality,
        court: f.court === '' ? null : Number(f.court),
        scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : null,
        teamAId: f.teamAId || undefined,
        teamBId: f.teamBId || undefined,
        ...(f.counts ? { countsInStandings: true, stageId: place.stageId, matchdayId: place.matchdayId } : {}),
      })
      setF({ teamAId: '', teamBId: '', court: '', scheduledAt: '', counts: false })
      await onDone()
    } catch (er) { setErr(er.message) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <p className="text-sm font-bold">Agregar partido al torneo</p>
      <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
        {[['teamAId', 'Equipo A'], ['teamBId', 'Equipo B']].map(([k, l]) => (
          <label key={k} className="text-xs text-muted">{l}
            <select className={inputCls} value={f[k]} onChange={(e) => set(k, e.target.value)}>
              <option value="">Por definir</option>
              {teams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
        <label className="text-xs text-muted">Fecha y hora
          <input type="datetime-local" className={inputCls} value={f.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} />
        </label>
        <label className="text-xs text-muted">Cancha
          <input type="number" min="1" placeholder="Opcional" className={inputCls} value={f.court} onChange={(e) => set('court', e.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.counts} onChange={(e) => set('counts', e.target.checked)} /> Suma a la tabla de posiciones
      </label>
      {f.counts
        ? <StandingsPicker t={t} days={days} teamAId={f.teamAId} teamBId={f.teamBId} value={place} onChange={setPlace} />
        : <p className="text-xs text-muted">Sin sumar, el partido se muestra aparte en "Fuera del fixture" y no cuenta en la tabla.</p>}
      <Btn type="submit" tone="accent" disabled={busy || (f.counts && !commonZones(t, f.teamAId, f.teamBId).length)} className="w-full">Agregar partido</Btn>
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
      {admin && <AddMatchForm t={t} days={days} onDone={changed} setErr={setErr} />}
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
