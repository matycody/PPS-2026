import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Clock, Search, X } from 'lucide-react'
import { api } from '../lib/api'
import { fmtWhen, courtLabel, BRANCH, MODALITY, TSTATUS } from '../lib/format'
import StatusPill from '../components/StatusPill'
import TeamBadge from '../components/TeamBadge'
import GoTo from '../components/GoTo'
import { inputCls } from '../components/ui'
import { useAuthStore } from '../stores/authStore'
import { getRecent, addRecent, removeRecent, clearRecent } from '../lib/recentSearches'

const ROLE = { ADMIN: 'Organizador', REFEREE: 'Árbitro', PLAYER: 'Jugador' }

function Section({ title, count, children }) {
  if (!count) return null
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted">{title} · {count}</h2>
      {children}
    </section>
  )
}

const Row = ({ to, children }) => {
  const cls = 'flex items-center gap-3 rounded-2xl border border-line bg-surface p-3'
  return to ? <Link to={to} className={cls}>{children}</Link> : <div className={cls}>{children}</div>
}

function Person({ p, to }) {
  return (
    <Row to={to}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">
          {p.number != null ? '#' + p.number + ' ' : ''}{p.name}{p.nickname ? ' "' + p.nickname + '"' : ''}
          {!p.active && <span className="ml-2 text-xs font-normal text-muted">(inactivo)</span>}
        </p>
        <p className="truncate text-xs text-muted">
          {p.dni ? 'DNI ' + p.dni : 'Jugador'}{p.teams.length ? ' · ' + p.teams.map((t) => t.team.name + ' (' + BRANCH[t.branch] + ')').join(', ') : ''}
        </p>
      </div>
    </Row>
  )
}

function MatchRow({ m, admin }) {
  return (
    <Row to={(admin ? '/admin/partidos/' : '/partido/') + m.id}>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{m.teamA?.name ?? 'Por definir'} vs {m.teamB?.name ?? 'Por definir'}</p>
        <p className="truncate text-xs text-muted">
          {[m.tournament?.name ?? 'Amistoso', MODALITY[m.modality], BRANCH[m.branch]].join(' · ')}
        </p>
        <p className="text-xs text-muted">{m.scheduledAt ? fmtWhen(m.scheduledAt, m.timeSet) : 'Sin programación'} · {courtLabel(m.court)}</p>
      </div>
      <StatusPill status={m.status} />
    </Row>
  )
}

// Búsqueda global para todos los roles; el backend solo devuelve las secciones que le corresponden a cada uno
export default function BuscarPage() {
  const admin = useAuthStore((s) => s.menu).includes('partidos')
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [text, setText] = useState(q)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const uid = useAuthStore((s) => s.user?.id)
  const [recent, setRecent] = useState(() => getRecent(uid))
  useEffect(() => { setRecent(getRecent(uid)) }, [uid])
  const remember = () => { if (res && total > 0) setRecent(addRecent(uid, q)) } // solo se guarda lo que dio resultados

  useEffect(() => { setText(q) }, [q])
  useEffect(() => {
    const t = setTimeout(() => { if (text.trim() !== q.trim()) setParams(text.trim() ? { q: text.trim() } : {}, { replace: true }) }, 300)
    return () => clearTimeout(t)
  }, [text])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setRes(null); return }
    let alive = true
    setErr('')
    api('GET', '/search?q=' + encodeURIComponent(term))
      .then((r) => alive && setRes(r))
      .catch((e) => alive && setErr(e.message))
    return () => { alive = false }
  }, [q])

  const total = res ? res.tournaments.length + res.teams.length + res.players.length + res.referees.length + res.users.length + res.next.length + res.past.length : 0

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Buscar</h1>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input autoFocus className={inputCls + ' pl-11'} placeholder="Torneo, equipo, jugador o partido" value={text} onChange={(e) => setText(e.target.value)}
          enterKeyHint="search" onBlur={remember} onKeyDown={(e) => e.key === 'Enter' && remember()} />
      </div>
      {q.trim().length < 2 && recent.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Búsquedas recientes</h2>
            <button onClick={() => setRecent(clearRecent(uid))} className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold">Borrar todo</button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {recent.map((t) => (
              <div key={t} className="flex items-center gap-1 border-b border-line last:border-0">
                <button onClick={() => { setText(t); setParams({ q: t }, { replace: true }) }} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left">
                  <Clock size={16} className="shrink-0 text-muted" />
                  <span className="truncate text-sm font-semibold">{t}</span>
                </button>
                <button onClick={() => setRecent(removeRecent(uid, t))} aria-label={'Quitar ' + t} className="grid h-11 w-11 shrink-0 place-items-center text-muted"><X size={16} /></button>
              </div>
            ))}
          </div>
        </section>
      )}
      {q.trim().length < 2 && recent.length === 0 && <p className="text-muted">Escribí al menos 2 letras. Ej.: "morán", "cloth femenino", "amistoso".</p>}
      {err && <p className="text-danger">{err}</p>}
      {q.trim().length >= 2 && !res && !err && <p className="text-muted">Buscando…</p>}
      {res && total === 0 && <p className="text-muted">No encontramos nada para "{q}".</p>}

      {res && (
        <div className="space-y-4" onClick={remember}>
          <Section title="Torneos" count={res.tournaments.length}>
            {res.tournaments.map((t) => (
              <Row key={t.id} to={(admin ? '/admin/torneos/' : '/liga/') + t.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{t.name}{t.edition ? ' · ' + t.edition : ''} <span className="font-normal text-muted">· {t.year}</span></p>
                  <p className="text-xs text-muted">{BRANCH[t.branch]} · {MODALITY[t.modality]}</p>
                </div>
                <span className={'rounded-full px-2 py-0.5 text-xs font-bold uppercase ' + (TSTATUS[t.status]?.cls ?? '')}>{TSTATUS[t.status]?.label ?? t.status}</span>
              </Row>
            ))}
          </Section>

          <Section title="Equipos" count={res.teams.length}>
            {res.teams.map((t) => (
              <Row key={t.id} to={(admin ? '/admin/equipos/' : '/equipo/') + t.id}>
                <TeamBadge team={t} size="sm" />
                <span className="min-w-0 flex-1 truncate font-bold">{t.name}</span>
                {admin && <GoTo to={'/equipo/' + t.id} className="shrink-0 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">Ver banner</GoTo>}
              </Row>
            ))}
          </Section>

          <Section title="Jugadores" count={res.players.length}>{res.players.map((p) => <Person key={p.id} p={p} to={'/jugador/' + p.id} />)}</Section>
          <Section title="Árbitros" count={res.referees.length}>{res.referees.map((p) => <Person key={p.id} p={p} to={admin ? '/admin/personas' : null} />)}</Section>

          <Section title="Usuarios y roles" count={res.users.length}>
            {res.users.map((u) => (
              <Row key={u.id} to="/admin/usuarios">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{u.profile?.name ?? u.email}</p>
                  <p className="truncate text-xs text-muted">{u.email}{u.active ? '' : ' · inactivo'}</p>
                </div>
                <span className="flex flex-wrap justify-end gap-1">
                  {u.roles.length === 0 && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold uppercase text-muted">Registrado</span>}
                  {u.roles.map((r) => <span key={r} className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold uppercase text-accent">{ROLE[r] ?? r}</span>)}
                </span>
              </Row>
            ))}
          </Section>

          <Section title="Próximos partidos" count={res.next.length}>{res.next.map((m) => <MatchRow key={m.id} m={m} admin={admin} />)}</Section>
          <Section title="Historial de partidos" count={res.past.length}>{res.past.map((m) => <MatchRow key={m.id} m={m} admin={admin} />)}</Section>
        </div>
      )}
    </div>
  )
}
