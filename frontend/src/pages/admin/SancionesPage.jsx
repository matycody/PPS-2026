import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gavel, Undo2 } from 'lucide-react'
import { api } from '../../lib/api'
import { BRANCH, MODALITY, PENALTY_KIND, penaltyWhy } from '../../lib/format'
import { Btn, Alert, inputCls } from '../../components/ui'
import { useConfirm } from '../../components/ConfirmProvider'

const fmt = (d) => (d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')

function resumen(s) {
  const parts = []
  if (s.sameDay) parts.push('resto de la jornada')
  if (s.fechas > 0) parts.push(s.fechas + (s.fechas === 1 ? ' fecha' : ' fechas'))
  return parts.length ? 'Suspendido: ' + parts.join(' + ') + (s.scope === 'ALL' ? ' · todas las modalidades' : ' · solo esta modalidad') : 'Sin suspensión'
}

function Card({ r, onSaved }) {
  const ask = useConfirm()
  const [edit, setEdit] = useState(!r.suspension)
  const [fechas, setFechas] = useState(r.suspension?.fechas ?? 1)
  const [sameDay, setSameDay] = useState(r.suspension?.sameDay ?? false)
  const [scope, setScope] = useState(r.suspension?.scope ?? 'MODALITY')
  const [note, setNote] = useState(r.suspension?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const m = r.match

  const save = async (f, sd) => {
    setBusy(true); setErr('')
    try {
      await api('PUT', '/sanctions/' + r.id + '/suspension', { fechas: f, sameDay: sd, scope, note })
      setEdit(false); onSaved()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const undo = async () => {
    if (!(await ask({ title: 'Deshacer la decisión', message: 'La roja vuelve a quedar pendiente de evaluación.', confirmText: 'Deshacer' }))) return
    await api('DELETE', '/sanctions/' + r.id + '/suspension').then(onSaved).catch((e) => setErr(e.message))
  }

  return (
    <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 h-6 w-4 shrink-0 rounded-sm bg-red-600" />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold leading-tight">{r.player?.name}{r.player?.number != null ? ' #' + r.player.number : ''}</p>
          <p className="text-xs text-muted">
            <Link to={'/partido/' + m.id} className="underline">{m.teamA ?? '?'} vs {m.teamB ?? '?'}</Link> · {m.tournament ?? 'Amistoso'} · {fmt(m.scheduledAt)}
          </p>
          {r.reason && <p className="mt-1 text-sm">“{r.reason}”</p>}
        </div>
      </div>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {!edit && r.suspension && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <span className="font-semibold">{resumen(r.suspension)}{r.suspension.note ? ' · ' + r.suspension.note : ''}</span>
          <div className="flex gap-1">
            <button onClick={() => setEdit(true)} className="rounded-lg px-2 py-1 text-xs font-bold text-accent">Editar</button>
            <button onClick={undo} aria-label="Deshacer" className="rounded-lg px-2 py-1 text-muted"><Undo2 size={16} /></button>
          </div>
        </div>
      )}
      {edit && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sameDay} onChange={(e) => setSameDay(e.target.checked)} className="h-4 w-4" />
            No juega lo que resta de la misma jornada
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Fechas siguientes sin jugar</span>
            <input type="number" min="0" max="20" value={fechas} onChange={(e) => setFechas(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} className={inputCls + ' !w-24 text-center'} />
          </label>
          <div className="space-y-1.5 text-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">Alcance</p>
            {[['MODALITY', 'Solo ' + (r.match.modality === 'CLOTH' ? 'Cloth' : 'Foam') + ' (la modalidad de la roja)'], ['ALL', 'Todas las modalidades y equipos']].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2"><input type="radio" name={'scope-' + r.id} checked={scope === k} onChange={() => setScope(k)} className="h-4 w-4" />{l}</label>
            ))}
          </div>
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Nota del departamento (opcional)" className={inputCls} />
          <div className="flex gap-2">
            <Btn tone="accent" disabled={busy || (fechas === 0 && !sameDay)} onClick={() => save(fechas, sameDay)} className="flex-1">Aplicar suspensión</Btn>
            <Btn disabled={busy} onClick={() => save(0, false)} className="flex-1">Sin suspensión</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

// Sanción a un jugador de un torneo sin partido (ej. tirar la pelota a otro partido a propósito para perjudicarlo)
function StandaloneCard({ r, onSaved }) {
  const ask = useConfirm()
  const [err, setErr] = useState('')
  const undo = async () => {
    if (!(await ask({ title: 'Levantar la sanción', message: 'El jugador vuelve a quedar habilitado.', confirmText: 'Levantar' }))) return
    await api('DELETE', '/sanctions/standalone/' + r.id).then(onSaved).catch((e) => setErr(e.message))
  }
  return (
    <div className="space-y-2 rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <Gavel size={18} className="mt-0.5 shrink-0 text-danger" />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold leading-tight">{r.player?.name}{r.player?.number != null ? ' #' + r.player.number : ''}</p>
          <p className="text-xs text-muted">Sanción de torneo sin partido{r.tournament ? ' · ' + r.tournament.name + (r.tournament.edition ? ' · ' + r.tournament.edition : '') : ''} · {fmt(r.createdAt)}</p>
          {r.reason && <p className="mt-1 text-sm">“{r.reason}”</p>}
        </div>
      </div>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
        <span className="font-semibold">{resumen(r.suspension)}{r.modality ? ' · ' + (r.modality === 'CLOTH' ? 'Cloth' : 'Foam') : ''}{r.suspension.note ? ' · ' + r.suspension.note : ''}</span>
        <button onClick={undo} aria-label="Levantar" className="rounded-lg px-2 py-1 text-xs font-bold text-accent">Levantar</button>
      </div>
    </div>
  )
}

// Formulario: sancionar a un jugador del torneo por algo fuera de su partido
export function StandaloneForm({ tournamentId, modality, onSaved }) {
  const [teams, setTeams] = useState([])
  const [teamId, setTeamId] = useState('')
  const [roster, setRoster] = useState([])
  const [profileId, setProfileId] = useState('')
  const [reason, setReason] = useState('')
  const [fechas, setFechas] = useState(1)
  const [sameDay, setSameDay] = useState(false)
  const [scope, setScope] = useState('MODALITY')
  const [mod, setMod] = useState(modality ?? 'CLOTH')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    api('GET', '/tournaments/' + tournamentId + '/standings').then((d) => {
      const m = new Map(d.stages.flatMap((z) => z.rows.map((r) => [r.team.id, r.team.name])))
      setTeams([...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)))
    }).catch((e) => setErr(e.message))
  }, [tournamentId])
  useEffect(() => {
    setProfileId(''); setRoster([])
    if (teamId) api('GET', '/teams/' + teamId).then((t) => setRoster(t.roster ?? [])).catch((e) => setErr(e.message))
  }, [teamId])
  const save = async () => {
    setBusy(true); setErr('')
    try {
      await api('POST', '/sanctions/standalone', { tournamentId, profileId, modality: mod, fechas, sameDay, scope, reason })
      setProfileId(''); setReason(''); setFechas(1); setSameDay(false)
      onSaved?.()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <div>
        <h4 className="text-sm font-extrabold">Sancionar a un jugador sin partido</h4>
        <p className="text-xs text-muted">Para cuando el jugador no estaba jugando ese partido (ej. tiró la pelota a otra cancha a propósito). La suspensión cuenta desde ahora y se aplica a todos sus partidos del alcance elegido.</p>
      </div>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      <div className="grid gap-2 sm:grid-cols-2">
        <select className={inputCls} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Equipo…</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className={inputCls} value={profileId} onChange={(e) => setProfileId(e.target.value)} disabled={!teamId}>
          <option value="">Jugador…</option>
          {roster.filter((p) => !p.coach).map((p) => <option key={p.profileId} value={p.profileId}>{p.number != null ? '#' + p.number + ' ' : ''}{p.name}</option>)}
        </select>
      </div>
      <input className={inputCls} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (obligatorio)" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sameDay} onChange={(e) => setSameDay(e.target.checked)} className="h-4 w-4" /> No juega lo que resta de la jornada</label>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Fechas siguientes sin jugar</span>
        <input type="number" min="0" max="20" value={fechas} onChange={(e) => setFechas(Math.max(0, Math.min(20, Number(e.target.value) || 0)))} className={inputCls + ' !w-24 text-center'} />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <select className={inputCls} value={mod} onChange={(e) => setMod(e.target.value)}>
          <option value="CLOTH">Modalidad: Cloth</option><option value="FOAM">Modalidad: Foam</option>
        </select>
        <select className={inputCls} value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="MODALITY">Solo esa modalidad</option><option value="ALL">Todas las modalidades</option>
        </select>
      </div>
      <Btn tone="accent" disabled={busy || !profileId || !reason.trim() || (fechas === 0 && !sameDay)} onClick={save}>Aplicar sanción</Btn>
    </div>
  )
}

// Rojas y suspensiones de jugadores. Con tournamentId solo muestra las de ese torneo.
export function SancionesPanel({ tournamentId = null }) {
  const [tab, setTab] = useState('pending')
  const [list, setList] = useState(null)
  const [err, setErr] = useState('')

  const q = tournamentId ? 'tournamentId=' + tournamentId : ''
  const load = () => api('GET', tab === 'active' ? '/sanctions/active' + (q ? '?' + q : '') : '/sanctions/reds?status=' + tab + (q ? '&' + q : '')).then((r) => setList(r.items)).catch((e) => setErr(e.message))
  useEffect(() => { setList(null); load() }, [tab])

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-2xl bg-surface-2 p-1 text-sm font-bold">
        {[['pending', 'Pendientes'], ['active', 'Vigentes'], ['decided', 'Evaluadas']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={'flex-1 rounded-xl py-2 ' + (tab === k ? 'bg-surface text-accent' : 'text-muted')}>{l}</button>
        ))}
      </div>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {list === null && !err && <p className="text-sm text-muted">Cargando…</p>}
      {list?.length === 0 && <p className="rounded-3xl border border-line bg-surface p-6 text-center text-sm text-muted">{tab === 'pending' ? 'No hay rojas pendientes de evaluación.' : tab === 'active' ? 'No hay jugadores suspendidos ahora.' : 'Todavía no hay rojas evaluadas.'}</p>}
      {list?.map((r) => (
        <div key={r.id + (r.suspension?.id ?? '')} className="space-y-1">
          {tab === 'active' && r.state && (
            <p className="px-2 text-xs font-bold text-danger">
              Le falta: {[r.state.sameDayLeft ? 'resto de la jornada' : null, r.state.remaining > 0 ? r.state.remaining + (r.state.remaining === 1 ? ' fecha' : ' fechas') : null].filter(Boolean).join(' + ')}
            </p>
          )}
          {r.standalone ? <StandaloneCard r={r} onSaved={load} /> : <Card r={r} onSaved={load} />}
        </div>
      ))}
    </div>
  )
}

// Quitas de puntos a equipos de todos los torneos (se cargan desde la pestaña Sanciones de cada torneo)
function TeamPenalties() {
  const [items, setItems] = useState(null)
  const [tour, setTour] = useState('')
  const [err, setErr] = useState('')
  const ask = useConfirm()
  const load = () => api('GET', '/sanctions/team-penalties').then((r) => setItems(r.items)).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])
  const tours = [...new Map((items ?? []).map((x) => [x.tournament.id, x.tournament])).values()]
  const list = (items ?? []).filter((x) => !tour || x.tournament.id === tour)
  async function remove(x) {
    if (x.tournament.status === 'FINISHED') return setErr('El torneo está cerrado: reabrilo para quitar la sanción')
    if (!(await ask({ title: 'Quitar la sanción', message: 'Se devuelven ' + x.points + ' punto(s) a ' + x.team.name + '.', confirmText: 'Quitar', danger: true }))) return
    await api('DELETE', '/tournaments/' + x.tournament.id + '/stages/' + x.stage.id + '/penalties/' + x.id).then(load).catch((e) => setErr(e.message))
  }
  return (
    <div className="space-y-3">
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {items === null && !err && <p className="text-sm text-muted">Cargando…</p>}
      {items && tours.length > 1 && (
        <select className={inputCls} value={tour} onChange={(e) => setTour(e.target.value)}>
          <option value="">Todos los torneos</option>
          {tours.map((t) => <option key={t.id} value={t.id}>{t.name}{t.edition ? ' · ' + t.edition : ''}</option>)}
        </select>
      )}
      {items && !list.length && <p className="rounded-3xl border border-line bg-surface p-6 text-center text-sm text-muted">Todavía no hay sanciones a equipos. Se cargan desde Torneos → Sanciones.</p>}
      {list.map((x) => (
        <div key={x.id} className="flex items-start justify-between gap-3 rounded-3xl border border-line bg-surface p-4">
          <div className="min-w-0">
            <p className="font-extrabold leading-tight"><span className="text-danger">−{x.points}</span> {x.team.name}</p>
            <p className="text-sm">{penaltyWhy(x) || PENALTY_KIND[x.kind]}{x.reason && (x.kind === 'STAFF' || x.missing?.length) ? ' · ' + x.reason : ''}</p>
            <p className="text-xs text-muted">
              <Link to={'/admin/torneos/' + x.tournament.id} className="underline">{x.tournament.name}{x.tournament.edition ? ' · ' + x.tournament.edition : ''}</Link>
              {' · ' + [MODALITY[x.tournament.modality], BRANCH[x.tournament.branch]].filter(Boolean).join(' ') + ' · ' + x.stage.name + (x.stage.tier ? ' · Cat. ' + String.fromCharCode(64 + x.stage.tier) : '') + ' · ' + fmt(x.createdAt)}
            </p>
          </div>
          <button onClick={() => remove(x)} aria-label="Quitar sanción" className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold text-muted">Quitar</button>
        </div>
      ))}
    </div>
  )
}

export default function SancionesPage() {
  const [kind, setKind] = useState('players')
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="flex items-center gap-2 text-xl font-extrabold"><Gavel size={20} /> Departamento de sanciones</h1>
      <div className="flex gap-2">
        {[['players', 'Jugadores'], ['teams', 'Equipos']].map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} className={'rounded-full px-4 py-2 text-sm font-bold ' + (kind === k ? 'bg-accent text-black' : 'border border-line bg-surface')}>{l}</button>
        ))}
      </div>
      {kind === 'players' ? <SancionesPanel /> : <TeamPenalties />}
    </div>
  )
}
