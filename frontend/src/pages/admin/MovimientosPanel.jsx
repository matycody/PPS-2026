import { useEffect, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { inputCls } from '../../components/ui'
import TeamBadge from '../../components/TeamBadge'

const when = (iso) => new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour12: false })
const dot = (m) => (m === 'DELETE' ? 'bg-danger' : m === 'POST' ? 'bg-live' : 'bg-accent')

// Lista de movimientos (GET /audit). params: { user, profile } para una persona; vacío = actividad general
function Feed({ params }) {
  const [list, setList] = useState(null)
  const [more, setMore] = useState(false)
  const [err, setErr] = useState('')
  const key = JSON.stringify(params)

  const load = (before) => {
    const p = new URLSearchParams({ limit: '50', ...params })
    if (before) p.set('before', before)
    return api('GET', '/audit?' + p)
      .then((r) => { setMore(r.length === 50); setList((cur) => (before ? [...(cur ?? []), ...r] : r)) })
      .catch((e) => setErr(e.message))
  }
  useEffect(() => { setList(null); setErr(''); load() }, [key])

  return (
    <div className="space-y-2">
      {err && <p className="text-sm text-danger">{err}</p>}
      {list === null && !err && <p className="text-sm text-muted">Cargando…</p>}
      {list?.length === 0 && <p className="text-sm text-muted">Sin movimientos registrados.</p>}
      {(list ?? []).map((l) => (
        <div key={l.id} className="flex items-start gap-3 rounded-xl border border-line bg-bg p-3 text-sm">
          <span className={'mt-1.5 h-2 w-2 shrink-0 rounded-full ' + dot(l.method)} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{l.label}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{l.actorEmail ?? '—'} · {when(l.createdAt)}</p>
          </div>
        </div>
      ))}
      {more && <button className="w-full py-2 text-sm font-bold text-accent" onClick={() => load(list[list.length - 1].createdAt)}>Ver más</button>}
    </div>
  )
}

function Group({ title, sub, icon, open, onToggle, children }) {
  return (
    <div className="rounded-2xl border border-line bg-surface">
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{title}</span>
          {sub && <span className="block text-xs text-muted">{sub}</span>}
        </span>
        <ChevronDown size={18} className={'shrink-0 text-muted transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && <div className="space-y-2 border-t border-line p-3">{children}</div>}
    </div>
  )
}

// Equipo -> jugadores -> movimientos de la persona elegida
export default function MovimientosPanel() {
  const [teams, setTeams] = useState(null)
  const [openTeam, setOpenTeam] = useState(null)
  const [sel, setSel] = useState(null) // { key, user, profile }
  const [q, setQ] = useState('')
  const [mail, setMail] = useState('')
  const [users, setUsers] = useState(null)
  const [openOthers, setOpenOthers] = useState(false)
  const [openGeneral, setOpenGeneral] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { api('GET', '/audit/roster').then(setTeams).catch((e) => setErr(e.message)) }, [])

  const term = q.trim().toLowerCase()
  const shown = (teams ?? [])
    .map((t) => ({ ...t, list: term ? t.players.filter((p) => (p.name + ' ' + (p.nickname ?? '')).toLowerCase().includes(term)) : t.players }))
    .filter((t) => !term || t.list.length)

  const pick = (key, user, profile) => setSel((s) => (s?.key === key ? null : { key, user, profile }))
  const feedParams = (s) => ({ ...(s.user ? { user: s.user } : {}), ...(s.profile ? { profile: s.profile } : {}) })

  async function searchUsers(e) {
    e.preventDefault()
    if (!mail.trim()) return setUsers(null)
    setUsers(await api('GET', '/users?q=' + encodeURIComponent(mail.trim())).catch((er) => { setErr(er.message); return [] }))
  }

  return (
    <div className="space-y-3">
      {err && <p className="text-danger">{err}</p>}
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input className={inputCls + ' pl-10'} placeholder="Buscar jugador por nombre" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {teams === null && !err && <p className="text-muted">Cargando equipos…</p>}
      {teams && shown.length === 0 && <p className="text-muted">No hay jugadores que coincidan.</p>}

      {shown.map((t) => (
        <Group key={t.id} title={t.name} sub={t.players.length + ' jugadores'} icon={<TeamBadge team={t} size="sm" />}
          open={!!term || openTeam === t.id} onToggle={() => setOpenTeam(openTeam === t.id ? null : t.id)}>
          {t.list.length === 0 && <p className="text-sm text-muted">Sin jugadores.</p>}
          {t.list.map((p) => {
            const key = 'p:' + p.profileId
            const on = sel?.key === key
            return (
              <div key={p.profileId}>
                <button onClick={() => pick(key, p.userId, p.profileId)}
                  className={'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold ' + (on ? 'border-accent text-accent' : 'border-line')}>
                  <span className="truncate">{p.name}{p.nickname ? ' “' + p.nickname + '”' : ''}</span>
                  <span className="shrink-0 text-xs font-normal text-muted">{p.userId ? (p.number != null ? '#' + p.number : '') : 'sin cuenta'}</span>
                </button>
                {on && <div className="mt-2"><Feed params={feedParams(sel)} /></div>}
              </div>
            )
          })}
        </Group>
      ))}

      <Group title="Otros usuarios" sub="Organizadores, árbitros, invitados: buscar por mail" open={openOthers} onToggle={() => setOpenOthers(!openOthers)}>
        <form onSubmit={searchUsers} className="flex gap-2">
          <input className={inputCls} placeholder="Mail" value={mail} onChange={(e) => setMail(e.target.value)} />
          <button type="submit" className="rounded-2xl border border-line bg-surface-2 px-4"><Search size={18} /></button>
        </form>
        {users?.length === 0 && <p className="text-sm text-muted">Sin resultados.</p>}
        {(users ?? []).map((u) => {
          const key = 'u:' + u.id
          const on = sel?.key === key
          return (
            <div key={u.id}>
              <button onClick={() => pick(key, u.id, u.profileId)}
                className={'w-full truncate rounded-xl border px-3 py-2.5 text-left text-sm font-semibold ' + (on ? 'border-accent text-accent' : 'border-line')}>{u.email}</button>
              {on && <div className="mt-2"><Feed params={feedParams(sel)} /></div>}
            </div>
          )
        })}
      </Group>

      <Group title="Actividad general" sub="Últimos movimientos de todos" open={openGeneral} onToggle={() => setOpenGeneral(!openGeneral)}>
        <Feed params={{}} />
      </Group>
    </div>
  )
}
