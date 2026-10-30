import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import BackLink from '../../components/BackLink'
import { ChevronLeft, Pencil, X } from 'lucide-react'
import { api } from '../../lib/api'
import { Btn, Alert, inputCls } from '../../components/ui'
import MatchForm from '../../components/MatchForm'
import StatusPill from '../../components/StatusPill'
import MatchNotice from '../../components/MatchNotice'
import Versus from '../../components/Versus'
import { matchInfo } from '../../lib/matchInfo'
import { statusBorder } from '../../lib/statusStyle'
import { personNumber } from '../../lib/person'
import { useConfirm } from '../../components/ConfirmProvider'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'

const FN = { REFEREE: 'Árbitro', TABLE: 'Mesa' }
const CONFLICT_MSG = 'No seleccionable: pertenece a un equipo de este partido'
const norm = (s) => (s ?? '').toString().toLowerCase()

// Equipo del jugador en la rama del partido; si no juega esa rama, el primero que tenga
function primaryTeam(profile, branch) {
  if (!profile?.teams?.length) return null
  return profile.teams.find((t) => t.branch === branch) ?? profile.teams[0]
}

// ¿Juega en alguno de los dos equipos de este partido? (en cualquier rama)
function inMatchTeam(profile, m) {
  if (!profile?.teams?.length) return false
  const ids = [m.teamA?.id, m.teamB?.id].filter(Boolean)
  return profile.teams.some((t) => ids.includes(t.teamId))
}

// "#7 Nombre (Equipo)"; sin número, "Nombre (Equipo)"; sin perfil, el texto de reserva (el mail)
function personLabel(profile, branch, fallback) {
  if (!profile) return fallback
  const num = personNumber(profile)
  const team = primaryTeam(profile, branch)
  return (num != null ? '#' + num + ' ' : '') + profile.name + (team ? ' (' + (team.team?.name ?? team.name) + ')' : '')
}
function roleTag(profile) {
  const r = []
  if (profile?.isPlayer) r.push('Jugador')
  if (profile?.isReferee) r.push('Árbitro')
  return r.join(' / ')
}

// Sin conflicto primero (alfabético), en conflicto al final
function sortOptions(list) {
  return [...list].sort((a, b) => Number(a.conflict) - Number(b.conflict) || a.label.localeCompare(b.label, 'es'))
}

// Buscador con resultados clicables; en conflicto se ve en rojo y no se puede elegir
function PickList({ query, onQuery, options, placeholder, emptyText, onPick, disabled }) {
  return (
    <div className="space-y-2">
      <input
        className={inputCls}
        placeholder={placeholder}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        disabled={disabled}
      />
      {!disabled && (
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line bg-bg p-1">
          {options.length === 0 && <p className="p-2 text-sm text-muted">{emptyText}</p>}
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onPick(o)}
              className={'block w-full truncate rounded-lg px-3 py-2 text-left text-sm font-semibold ' + (o.conflict ? 'text-danger' : 'hover:bg-surface-2')}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminMatchPage() {
  const ask = useConfirm()
  const { id } = useParams()
  const [m, setM] = useState(null)
  const [tournaments, setTournaments] = useState(null)
  const [teams, setTeams] = useState(null)
  const [profiles, setProfiles] = useState(null)
  const [admins, setAdmins] = useState(null)
  const [refPick, setRefPick] = useState('')
  const [mesaTab, setMesaTab] = useState('profile') // 'profile' | 'team' | 'admin'
  const [profileQ, setProfileQ] = useState('')
  const [teamQ, setTeamQ] = useState('')
  const [adminQ, setAdminQ] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState('')
  const [newDate, setNewDate] = useState('')
  const [editing, setEditing] = useState(false)
  // Cambios de asignaciones sin guardar: quitar (ids) y sumar (pendientes)
  const [delIds, setDelIds] = useState([])
  const [adds, setAdds] = useState([])
  const dirty = delIds.length > 0 || adds.length > 0
  const { modal: leaveModal } = useLeaveGuard(dirty, '', {
    title: '¿Salir sin guardar?',
    message: 'Tenés cambios en las asignaciones sin guardar. Si salís, se pierden.',
    stay: 'Quedarme',
    leave: 'Salir',
  })
  useEffect(() => { setDelIds([]); setAdds([]) }, [id])

  const load = () => api('GET', '/matches/' + id).then(setM).catch((e) => setErr(e.message))
  useEffect(() => {
    load()
    api('GET', '/tournaments').then(setTournaments).catch(() => {})
    api('GET', '/teams').then(setTeams).catch(() => {})
    api('GET', '/profiles?active=true').then(setProfiles).catch(() => {})
    api('GET', '/users?role=ADMIN').then(setAdmins).catch(() => {})
  }, [id])

  useEffect(() => { setReason(m?.statusReason ?? '') }, [m?.id, m?.statusReason])

  async function run(fn, msg) {
    setBusy(true); setErr(''); setOk('')
    try { await fn(); await load(); if (msg) setOk(msg) } catch (e) { setErr(e.data?.errors?.join(' · ') || e.message) } finally { setBusy(false) }
  }

  if (!m || !tournaments || !teams || !profiles || !admins) return <p className="mt-10 text-center text-muted">{err || 'Cargando…'}</p>

  const editable = m.status === 'SCHEDULED' || m.status === 'READY'
  const assignments = m.assignments ?? []
  const shown = [...assignments.filter((a) => !delIds.includes(a.id)), ...adds]
  const label = (a) => {
    if (a._label) return a._label
    if (a.profile) return (a.profile.nickname || a.profile.name) + (a.function === 'TABLE' ? ' · ' + roleTag(a.profile) : '')
    if (a.team) return a.team.name + ' (equipo)'
    if (a.user) return a.user.email + ' (admin)'
    return a.profileId || a.teamId || a.userId || '—'
  }
  const byEmail = new Map(profiles.map((p) => [p.email, p]))

  const refOptions = sortOptions(
    profiles
      .filter((p) => p.isReferee)
      .map((p) => ({ id: p.id, conflict: inMatchTeam(p, m), label: personLabel(p, m.branch, p.name) }))
  )

  const mesaByProfile = sortOptions(
    profiles
      .filter((p) => norm(p.name).includes(norm(profileQ)) || norm(p.nickname).includes(norm(profileQ)) || norm(p.dni).includes(norm(profileQ)))
      .map((p) => {
        const rt = roleTag(p)
        return { id: p.id, conflict: inMatchTeam(p, m), label: personLabel(p, m.branch, p.name) + (rt ? ' · ' + rt : '') }
      })
  )
  const mesaByTeam = sortOptions(
    teams
      .filter((t) => norm(t.name).includes(norm(teamQ)))
      .map((t) => ({ id: t.id, conflict: t.id === m.teamA?.id || t.id === m.teamB?.id, label: t.name }))
  )
  const mesaByAdmin = sortOptions(
    admins
      .filter((u) => norm(u.email).includes(norm(adminQ)) || norm(byEmail.get(u.email)?.name).includes(norm(adminQ)))
      .map((u) => {
        const profile = byEmail.get(u.email) ?? null
        return { id: u.id, conflict: inMatchTeam(profile, m), label: (profile ? personLabel(profile, m.branch, u.email) : u.email) + ' · admin' }
      })
  )

  const existingTeamMesa = shown.find((a) => a.function === 'TABLE' && a.team)

  const sameTarget = (a, fn, body) => a.function === fn && ((body.profileId && (a.profileId ?? a.profile?.id) === body.profileId) || (body.teamId && (a.teamId ?? a.team?.id) === body.teamId) || (body.userId && (a.userId ?? a.user?.id) === body.userId))
  const addDraft = (fn, body, text) => {
    if (shown.some((a) => sameTarget(a, fn, body))) return setErr('Ya está asignado')
    setErr('')
    setAdds((l) => [...l, { id: 'new-' + Date.now() + '-' + l.length, _new: true, _label: text, function: fn, body }])
  }
  const removeDraft = (a) => (a._new ? setAdds((l) => l.filter((x) => x.id !== a.id)) : setDelIds((l) => [...l, a.id]))
  const discard = () => { setDelIds([]); setAdds([]) }
  const saveAssignments = () => run(async () => {
    const left = [...adds]
    try {
      for (const d of [...delIds]) { await api('DELETE', '/matches/' + id + '/assignments/' + d); setDelIds((l) => l.filter((x) => x !== d)) }
      for (const a of [...left]) { await api('POST', '/matches/' + id + '/assignments', { function: a.function, ...a.body }); setAdds((l) => l.filter((x) => x.id !== a.id)) }
    } catch (e) { throw e }
  }, 'Asignaciones guardadas')
  const pickMesa = (o, body) => {
    if (o.conflict) return setErr(CONFLICT_MSG)
    addDraft('TABLE', body, o.label + (body.teamId ? ' (equipo)' : body.userId ? ' (admin)' : ''))
  }

  return (
    <div className="space-y-4">
      {leaveModal}
      <BackLink to="/admin/partidos" className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft size={16} /> Partidos
      </BackLink>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {ok && <Alert tone="ok" onClose={() => setOk('')}>{ok}</Alert>}

      <div className={'space-y-3 rounded-3xl border bg-surface p-5 ' + statusBorder(m.status)}>
        <div className="flex justify-center"><StatusPill status={m.status} /></div>
        <Versus a={m.teamA} b={m.teamB} size="lg" />
        <p className="text-center text-xs font-bold uppercase tracking-wider text-muted">{matchInfo(m)}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link to={'/partido/' + id} className="rounded-2xl border border-line bg-surface-2 py-3 text-center text-sm font-extrabold">Ver en vivo</Link>
        <Link to={'/control/' + id} className="rounded-2xl border border-line bg-surface-2 py-3 text-center text-sm font-extrabold">Control</Link>
        {m.status === 'SCHEDULED' && <Btn tone="accent" className="col-span-2" disabled={busy} onClick={() => run(() => api('POST', '/matches/' + id + '/ready'), 'Partido habilitado')}>Habilitar partido</Btn>}
        {m.status === 'READY' && <Btn className="col-span-2" disabled={busy} onClick={() => run(() => api('POST', '/matches/' + id + '/unready'), 'Habilitación revertida')}>Deshabilitar partido</Btn>}
      </div>

      <section className="space-y-3 rounded-3xl border border-line bg-surface p-5">
        <p className="text-sm font-bold">Asignaciones</p>
        {shown.length === 0 && <p className="text-sm text-muted">Sin asignaciones.</p>}
        {shown.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <span className="w-14 shrink-0 text-[11px] font-bold uppercase text-accent">{FN[a.function] ?? a.function}</span>
            <span className="flex-1 truncate font-semibold">{label(a)}</span>
            {a._new && <span className="shrink-0 rounded-full bg-accent/20 px-2 text-[10px] font-bold uppercase text-accent">nuevo</span>}
            <button aria-label="Quitar" disabled={busy} onClick={() => removeDraft(a)}>
              <X size={16} className="text-danger" />
            </button>
          </div>
        ))}

        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Asignar árbitro</p>
          <div className="flex gap-2">
            <select className={inputCls} value={refPick} onChange={(e) => {
              const opt = refOptions.find((o) => o.id === e.target.value)
              if (opt?.conflict) return setErr(CONFLICT_MSG)
              setRefPick(e.target.value)
            }}>
              <option value="">Árbitro…</option>
              {refOptions.map((o) => (
                <option key={o.id} value={o.id} style={o.conflict ? { color: '#f43f5e' } : undefined}>{o.label}</option>
              ))}
            </select>
            <Btn tone="accent" disabled={busy || !refPick} onClick={() => { addDraft('REFEREE', { profileId: refPick }, refOptions.find((o) => o.id === refPick)?.label ?? 'Árbitro'); setRefPick('') }}>Asignar</Btn>
          </div>
        </div>

        <div className="space-y-3 border-t border-line pt-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Asignar mesa</p>
          <div className="flex gap-2">
            <Btn tone={mesaTab === 'profile' ? 'accent' : 'base'} onClick={() => setMesaTab('profile')} className="flex-1 py-2 text-xs">Persona</Btn>
            <Btn tone={mesaTab === 'team' ? 'accent' : 'base'} onClick={() => setMesaTab('team')} className="flex-1 py-2 text-xs">Equipo</Btn>
            <Btn tone={mesaTab === 'admin' ? 'accent' : 'base'} onClick={() => setMesaTab('admin')} className="flex-1 py-2 text-xs">Cuenta admin</Btn>
          </div>

          {mesaTab === 'profile' && (
            <PickList
              query={profileQ}
              onQuery={setProfileQ}
              options={mesaByProfile}
              placeholder="Nombre, apodo o DNI"
              emptyText="Sin resultados"
              onPick={(o) => pickMesa(o, { profileId: o.id })}
            />
          )}

          {mesaTab === 'team' && (
            existingTeamMesa ? (
              <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <span>Ya hay un equipo de mesa: <b>{existingTeamMesa.team?.name}</b></span>
                <button disabled={busy} onClick={() => removeDraft(existingTeamMesa)} className="text-danger">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <PickList
                query={teamQ}
                onQuery={setTeamQ}
                options={mesaByTeam}
                placeholder="Nombre del equipo"
                emptyText="Sin resultados"
                onPick={(o) => pickMesa(o, { teamId: o.id })}
              />
            )
          )}

          {mesaTab === 'admin' && (
            <PickList
              query={adminQ}
              onQuery={setAdminQ}
              options={mesaByAdmin}
              placeholder="Mail del admin"
              emptyText="Sin resultados"
              onPick={(o) => pickMesa(o, { userId: o.id })}
            />
          )}
        </div>

        {dirty && (
          <div className="flex gap-2 border-t border-line pt-3">
            <Btn className="flex-1" disabled={busy} onClick={discard}>Descartar</Btn>
            <Btn tone="accent" className="flex-1" disabled={busy} onClick={saveAssignments}>Guardar cambios</Btn>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold">Datos del partido</p>
          {editable && (
            <button aria-label={editing ? 'Cancelar edición' : 'Editar datos'} onClick={() => setEditing((v) => !v)} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted">
              {editing ? <X size={16} /> : <Pencil size={16} />}
            </button>
          )}
        </div>
        {editable && editing ? (
          <MatchForm
            key={m.status + m.scheduledAt + m.teamA?.id + m.teamB?.id}
            initial={m}
            tournaments={tournaments}
            teams={teams}
            busy={busy}
            label="Guardar cambios"
            onSubmit={(body) => run(async () => { await api('PATCH', '/matches/' + id, body); setEditing(false) }, 'Cambios guardados')}
          />
        ) : (
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted">Torneo</span><b>{m.tournament?.name ?? 'Amistoso'}</b></div>
            <div className="flex justify-between"><span className="text-muted">Equipos</span><b>{m.teamA?.name} vs {m.teamB?.name}</b></div>
            <div className="flex justify-between"><span className="text-muted">Cancha</span><b>{m.court ?? '—'}</b></div>
            <div className="flex justify-between"><span className="text-muted">Fecha y hora</span><b>{m.scheduledAt ? new Date(m.scheduledAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin programación'}</b></div>
            {!editable && <p className="pt-1 text-xs">Solo se edita con el partido Programado o Habilitado.</p>}
          </div>
        )}
      </section>

      {m.status !== 'FINISHED' && (
        <section className="space-y-3 rounded-3xl border border-line bg-surface p-5">
          <p className="text-sm font-bold">Suspensión y cancelación</p>
          <MatchNotice m={m} />
          <label className="block text-xs text-muted">Motivo (lo ven los espectadores)
            <textarea className={inputCls} rows={2} maxLength={300} placeholder="Ej.: lluvia, cancha no disponible, falta de árbitros…" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {m.status === 'SUSPENDED' && (
            <label className="block text-xs text-muted">Nueva fecha y hora
              <input type="datetime-local" className={inputCls} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            {editable && (
              <Btn className="flex-1 basis-[45%]" disabled={busy} onClick={() => run(() => api('POST', '/matches/' + id + '/suspend', { reason }), 'Partido suspendido')}>Suspender partido</Btn>
            )}
            {m.status === 'SUSPENDED' && (
              <Btn tone="accent" className="flex-1 basis-[45%]" disabled={busy || !newDate} onClick={() => run(async () => { await api('POST', '/matches/' + id + '/reschedule', { scheduledAt: new Date(newDate).toISOString(), reason }); setNewDate('') }, 'Partido reprogramado')}>Reprogramar</Btn>
            )}
            {(m.status === 'SUSPENDED' || m.status === 'CANCELLED' || m.originalScheduledAt) && (
              <Btn className="flex-1 basis-[45%]" disabled={busy} onClick={() => run(() => api('PATCH', '/matches/' + id + '/reason', { reason }), 'Motivo guardado')}>Guardar motivo</Btn>
            )}
            {m.status !== 'CANCELLED' && (
              <Btn tone="danger" className="flex-1 basis-[45%]" disabled={busy} onClick={async () => (await ask({ title: 'Cancelar partido', message: '¿Cancelar el partido?', confirmText: 'Cancelar partido', cancelText: 'Volver', danger: true })) && run(() => api('POST', '/matches/' + id + '/cancel', { reason }), 'Partido cancelado')}>Cancelar partido</Btn>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
