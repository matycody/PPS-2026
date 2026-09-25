import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, X } from 'lucide-react'
import { api } from '../../lib/api'
import { Btn, Alert, inputCls } from '../../components/ui'
import MatchForm from '../../components/MatchForm'
import StatusPill from '../../components/StatusPill'
import Versus from '../../components/Versus'
import { personNumber } from '../../lib/person'

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
  return (num != null ? '#' + num + ' ' : '') + profile.name + (team ? ' (' + team.name + ')' : '')
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

  const load = () => api('GET', '/matches/' + id).then(setM).catch((e) => setErr(e.message))
  useEffect(() => {
    load()
    api('GET', '/tournaments').then(setTournaments).catch(() => {})
    api('GET', '/teams').then(setTeams).catch(() => {})
    api('GET', '/profiles?active=true').then(setProfiles).catch(() => {})
    api('GET', '/users?role=ADMIN').then(setAdmins).catch(() => {})
  }, [id])

  async function run(fn, msg) {
    setBusy(true); setErr(''); setOk('')
    try { await fn(); await load(); if (msg) setOk(msg) } catch (e) { setErr(e.data?.errors?.join(' · ') || e.message) } finally { setBusy(false) }
  }

  if (!m || !tournaments || !teams || !profiles || !admins) return <p className="mt-10 text-center text-muted">{err || 'Cargando…'}</p>

  const editable = m.status === 'SCHEDULED' || m.status === 'READY'
  const assignments = m.assignments ?? []
  const label = (a) => {
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

  const existingTeamMesa = assignments.find((a) => a.function === 'TABLE' && a.team)

  const assign = (body) => run(async () => { await api('POST', '/matches/' + id + '/assignments', { function: 'TABLE', ...body }) })
  const pickMesa = (o, body) => {
    if (o.conflict) return setErr(CONFLICT_MSG)
    assign(body)
  }

  return (
    <div className="space-y-4">
      <Link to="/admin/partidos" className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft size={16} /> Partidos
      </Link>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {ok && <Alert tone="ok" onClose={() => setOk('')}>{ok}</Alert>}

      <div className="space-y-3 rounded-3xl border border-line bg-surface p-5">
        <div className="flex justify-center"><StatusPill status={m.status} /></div>
        <Versus a={m.teamA} b={m.teamB} size="lg" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link to={'/partido/' + id} className="rounded-2xl border border-line bg-surface-2 py-3 text-center text-sm font-extrabold">Ver en vivo</Link>
        <Link to={'/control/' + id} className="rounded-2xl border border-line bg-surface-2 py-3 text-center text-sm font-extrabold">Control</Link>
        {m.status === 'SCHEDULED' && <Btn tone="accent" disabled={busy} onClick={() => run(() => api('POST', '/matches/' + id + '/ready'), 'Partido habilitado')}>Habilitar partido</Btn>}
        {m.status === 'READY' && <Btn disabled={busy} onClick={() => run(() => api('POST', '/matches/' + id + '/unready'), 'Habilitación revertida')}>Deshabilitar partido</Btn>}
        {m.status !== 'FINISHED' && m.status !== 'CANCELLED' && (
          <Btn tone="danger" disabled={busy} onClick={() => confirm('¿Cancelar el partido?') && run(() => api('POST', '/matches/' + id + '/cancel'), 'Partido cancelado')}>Cancelar partido</Btn>
        )}
      </div>

      <section className="rounded-3xl border border-line bg-surface p-5">
        <p className="mb-3 text-sm font-bold">Datos del partido</p>
        {editable ? (
          <MatchForm
            key={m.status + m.scheduledAt + m.teamA?.id + m.teamB?.id}
            initial={m}
            tournaments={tournaments}
            teams={teams}
            busy={busy}
            label="Guardar cambios"
            onSubmit={(body) => run(() => api('PATCH', '/matches/' + id, body), 'Cambios guardados')}
          />
        ) : (
          <p className="text-sm text-muted">Solo se edita con el partido Programado o Habilitado.</p>
        )}
      </section>

      <section className="space-y-3 rounded-3xl border border-line bg-surface p-5">
        <p className="text-sm font-bold">Asignaciones</p>
        {assignments.length === 0 && <p className="text-sm text-muted">Sin asignaciones.</p>}
        {assignments.map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <span className="w-14 shrink-0 text-[11px] font-bold uppercase text-accent">{FN[a.function] ?? a.function}</span>
            <span className="flex-1 truncate font-semibold">{label(a)}</span>
            <button aria-label="Quitar" disabled={busy} onClick={() => run(() => api('DELETE', '/matches/' + id + '/assignments/' + a.id))}>
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
            <Btn tone="accent" disabled={busy || !refPick} onClick={() => run(async () => { await api('POST', '/matches/' + id + '/assignments', { function: 'REFEREE', profileId: refPick }); setRefPick('') })}>Asignar</Btn>
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
                <button disabled={busy} onClick={() => run(() => api('DELETE', '/matches/' + id + '/assignments/' + existingTeamMesa.id))} className="text-danger">
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
      </section>
    </div>
  )
}
