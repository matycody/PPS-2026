import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ClipboardList, Pin, PinOff, Trophy, User, X } from 'lucide-react'
import { api } from '../../lib/api'
import { BRANCH, MODALITY, courtLabel } from '../../lib/format'
import { halfLabel } from '../../lib/pipTime'
import { dayOf, dayTab } from '../../lib/days'
import TeamBadge from '../TeamBadge'
import GoTo from '../GoTo'
import Forma from '../torneo/Forma'
import FavHeart from '../FavHeart'
import StatusPill from '../StatusPill'
import MatchNotice from '../MatchNotice'
import VenueInfo from '../VenueInfo'
import PredictBox from '../PredictBox'
import ScoreTimeline from '../ScoreTimeline'
import MatchRoster from '../MatchRoster'
import StandingsView from '../torneo/StandingsView'
import { Skeleton } from '../ui'

const showTime = (t) => (t ? t.replace(/^(\d):/, '0$1:') : '--:--')

function ClockCard({ label, time, paused, finished }) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-muted">{label}</p>
      <p className="my-3 text-center font-mono text-[clamp(1.75rem,9vw,3rem)] font-extrabold tabular-nums text-live">{showTime(time)}</p>
      <p className={'rounded-full py-2 text-center text-xs font-bold uppercase ' + (finished ? 'bg-surface-2 text-muted' : paused ? 'bg-danger/15 text-danger' : 'bg-live/15 text-live')}>
        {finished ? 'Finalizado' : paused ? 'Pausado' : 'En marcha'}
      </p>
    </div>
  )
}

function TimeoutBanner({ tick, nameA, nameB }) {
  const team = tick?.timeoutTeam
  if (!team) return null
  const expired = !tick.isTimeoutRunning
  return (
    <div className="rounded-3xl border box-warn p-4 text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-warn">Tiempo muerto - {team === 'A' ? nameA : nameB}</p>
      <p className={'my-2 font-mono text-[clamp(2rem,10vw,3.5rem)] font-extrabold tabular-nums ' + (expired ? 'text-danger' : 'text-warn')}>{showTime(tick.timeoutTime)}</p>
    </div>
  )
}
const hourOf = (iso, timeSet) => (iso && timeSet !== false ? new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }) : null)

// Cuenta regresiva hasta el inicio programado (HH:MM:SS; con días si falta más de uno)
function useCountdown(iso, on) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!on || !iso) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [iso, on])
  if (!on || !iso) return null
  const s = Math.floor((new Date(iso).getTime() - now) / 1000)
  if (s <= 0) return null
  const d = Math.floor(s / 86400)
  const p = (n) => String(n).padStart(2, '0')
  return (d > 0 ? d + 'd ' : '') + p(Math.floor((s % 86400) / 3600)) + ':' + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60)
}

function Team({ t, slot, form, rank, branch }) {
  const body = (
    <>
      {slot ? (
        <span className="grid h-16 w-16 place-items-center rounded-full bg-surface-2 text-xl font-extrabold text-muted">{slot.big}</span>
      ) : (
        <TeamBadge team={t} size="lg" branch={branch} />
      )}
      <span className="w-full break-words text-sm font-bold leading-tight">{slot ? slot.current?.name ?? 'A definir' : t?.name ?? 'Por definir'}</span>
      {t && rank && <span className="text-[11px] font-bold leading-none text-muted">{rank}.º</span>}
      {t && form?.length > 0 && <Forma form={form} size="sm" />}
    </>
  )
  const cls = 'flex min-w-0 flex-col items-center gap-1.5 text-center'
  return t?.id ? <GoTo to={'/equipo/' + t.id} className={cls}>{body}</GoTo> : <div className={cls}>{body}</div>
}

// Cabecera: el centro depende del estado (previa: cuenta regresiva · en vivo: marcador y relojes · final: resultado)
function Header({ m, tick, over, pip }) {
  const live = m.status === 'LIVE' && !over
  const pre = m.status === 'SCHEDULED' || m.status === 'READY'
  const count = useCountdown(m.scheduledAt, pre)
  const when = m.scheduledAt ? [dayTab(dayOf(m.scheduledAt)), hourOf(m.scheduledAt, m.timeSet)].filter(Boolean).join(' · ') : 'Sin fecha'
  const score = (
    <span className={'font-mono text-4xl font-extrabold tabular-nums ' + (live ? 'text-live' : '')}>
      {m.score?.teamA ?? 0} <span className="text-lg text-muted">-</span> {m.score?.teamB ?? 0}
    </span>
  )
  let center
  if (over) {
    center = <><span className="text-xs font-bold uppercase tracking-widest text-muted">Final del partido</span>{score}</>
  } else if (live) {
    center = (
      <>
        {score}
        {tick && <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted">{halfLabel(tick)}</span>}
      </>
    )
  } else if (m.status === 'CANCELLED' || m.status === 'SUSPENDED') {
    center = <span className="text-sm font-extrabold uppercase tracking-wide text-danger">{m.status === 'CANCELLED' ? 'Cancelado' : 'Suspendido'}</span>
  } else {
    center = (
      <>
        {count && <span className="font-mono text-xs font-bold tabular-nums text-muted">{count}</span>}
        <span className="text-3xl font-extrabold tabular-nums">{hourOf(m.scheduledAt, m.timeSet) ?? '--:--'}</span>
        <span className="text-xs font-bold text-muted">{m.status === 'READY' ? 'Habilitado' : when}</span>
      </>
    )
  }
  return (
    <section className="relative rounded-3xl border border-line bg-surface p-4">
      {pip?.canPin && (
        <button type="button" onClick={pip.toggle} aria-label={pip.active ? 'Quitar reloj flotante' : 'Fijar reloj flotante'} aria-pressed={pip.active}
          className={'absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full ' + (pip.active ? 'text-live' : 'text-muted')}>
          {pip.active ? <PinOff size={18} /> : <Pin size={18} />}
        </button>
      )}
      {pip?.error && <p className="mb-2 text-center text-xs text-danger">{pip.error}</p>}
      <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-center">
        <StatusPill status={over ? 'FINISHED' : m.status} />
        <span className="text-xs text-muted">{courtLabel(m.court)} · {MODALITY[m.modality]} · {BRANCH[m.branch] ?? m.branch}</span>
      </div>
      {m.phase?.label && (
        <p className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-accent">
          {m.phase.kind === 'LEAGUE' && m.phase.zone ? m.phase.zone + ' · ' : ''}{m.phase.label}
        </p>
      )}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
        <Team t={m.teamA} slot={m.phase?.slotA} form={m.form?.A} rank={m.form?.rankA} branch={m.branch} />
        <div className="flex min-w-[96px] flex-col items-center gap-0.5 self-center text-center">{center}</div>
        <Team t={m.teamB} slot={m.phase?.slotB} form={m.form?.B} rank={m.form?.rankB} branch={m.branch} />
      </div>
      {m.tournament?.id && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Link to={'/liga/' + m.tournament.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-4 py-1.5 text-xs font-bold text-accent">
            <Trophy size={14} /> {m.tournament.name} <span aria-hidden>›</span>
          </Link>
          <FavHeart type="TOURNAMENT" id={m.tournament.id} name={m.tournament.name} className="!h-8 !w-8" />
        </div>
      )}
    </section>
  )
}

// Quiénes arbitran y quiénes están en la mesa; aparece cuando la organización los carga
function useStaff(id) {
  const [staff, setStaff] = useState(null)
  useEffect(() => {
    let alive = true
    api('GET', '/matches/' + id + '/staff').then((r) => alive && setStaff(r)).catch(() => {})
    return () => { alive = false }
  }, [id])
  return staff
}

function Details({ m }) {
  const staff = useStaff(m.id)
  const names = (list) => list.map((x) => x.team?.name ?? x.name).filter(Boolean).join(' · ')
  const refs = staff ? names(staff.referees) : ''
  const table = staff ? names(staff.table) : ''
  const when = m.scheduledAt ? dayTab(dayOf(m.scheduledAt)) + (hourOf(m.scheduledAt, m.timeSet) ? ' · ' + hourOf(m.scheduledAt, m.timeSet) : '') : 'Sin fecha'
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-extrabold">Detalles</h2>
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
        <p className="flex items-center gap-3 px-4 py-3 text-sm font-bold"><CalendarDays size={18} className="text-muted" /> {when}</p>
        {m.tournament?.id && (
          <Link to={'/liga/' + m.tournament.id} className="flex items-center gap-3 px-4 py-3 text-sm font-bold">
            <Trophy size={18} className="text-muted" />
            <span className="min-w-0 flex-1 truncate">{m.tournament.name}{m.phase?.label ? ' · ' + m.phase.label : ''}</span>
          </Link>
        )}
        {refs && <p className="flex items-center gap-3 px-4 py-3 text-sm"><User size={18} className="shrink-0 text-muted" /><span className="min-w-0"><span className="block text-[11px] font-bold uppercase tracking-wide text-muted">Árbitros</span><span className="font-bold">{refs}</span></span></p>}
        {table && <p className="flex items-center gap-3 px-4 py-3 text-sm"><ClipboardList size={18} className="shrink-0 text-muted" /><span className="min-w-0"><span className="block text-[11px] font-bold uppercase tracking-wide text-muted">Mesa de control</span><span className="font-bold">{table}</span></span></p>}
      </div>
      {m.venue && <VenueInfo venue={m.venue} className="w-full" />}
    </section>
  )
}

// Cara a cara: partidos ya jugados entre los dos equipos (de la información que ya tiene la web)
function HeadToHead({ m }) {
  const [list, setList] = useState(null)
  useEffect(() => {
    if (!m.teamA?.id || !m.teamB?.id) { setList([]); return }
    let alive = true
    api('GET', '/matches?teamId=' + m.teamA.id + '&limit=200')
      .then((r) => alive && setList(r.map((x) => ({ ...x, id: x.id ?? x.matchId })).filter((x) => x.status === 'FINISHED' && x.id !== m.id && [x.teamA?.id, x.teamB?.id].includes(m.teamB.id))))
      .catch(() => alive && setList([]))
    return () => { alive = false }
  }, [m.id, m.teamA?.id, m.teamB?.id])
  const tally = useMemo(() => {
    const t = { A: 0, E: 0, B: 0 }
    for (const x of list ?? []) {
      const a = x.score?.teamA ?? 0
      const b = x.score?.teamB ?? 0
      const aIsA = x.teamA?.id === m.teamA.id
      const mine = aIsA ? a : b
      const theirs = aIsA ? b : a
      if (mine > theirs) t.A++
      else if (mine < theirs) t.B++
      else t.E++
    }
    return t
  }, [list, m.teamA?.id])
  if (list === null) return <Skeleton />
  const total = list.length
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0)
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-extrabold">Cara a cara</h2>
      <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-line bg-surface text-center">
        {[[m.teamA?.name, tally.A], ['Empates', tally.E], [m.teamB?.name, tally.B]].map(([l, n]) => (
          <div key={l} className="border-r border-line p-3 last:border-r-0">
            <p className="truncate text-[11px] font-bold uppercase text-muted">{l}</p>
            <p className="text-3xl font-extrabold tabular-nums">{n}</p>
            <p className="text-[11px] font-bold text-muted">{pct(n)}%</p>
          </div>
        ))}
      </div>
      {total === 0 && <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">Todavía no jugaron entre sí.</p>}
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface empty:hidden">
        {list.map((x) => (
          <Link key={x.id} to={'/partido/' + x.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <span className="min-w-0 truncate font-bold">{x.teamA?.name} vs {x.teamB?.name}</span>
            <span className="shrink-0 font-mono font-extrabold tabular-nums">{x.score?.teamA ?? 0}-{x.score?.teamB ?? 0}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

const TABS = [['resumen', 'Resumen'], ['alineacion', 'Jugadores'], ['predicciones', 'Predicciones'], ['clasificacion', 'Clasificación'], ['cara', 'Cara a cara']]

// Vista del partido para todos los usuarios (la mesa y el árbitro controlan desde Control de mesa / Partidos asignados)
export default function MatchSpectator({ m, tick, over, notice, onCloseNotice, sanctions, pip }) {
  const [tab, setTab] = useState('resumen')
  const tabs = TABS.filter(([k]) => k !== 'clasificacion' || m.tournament?.id)
  return (
    <div className="space-y-4">
      <Header m={m} tick={tick} over={over} pip={pip} />
      <MatchNotice m={m} />
      {tick?.recovered && <p className="rounded-2xl bg-warn/15 px-4 py-3 text-center text-sm font-bold text-warn">Reloj recuperado tras un reinicio del servidor: puede que el tiempo no sea exacto hasta que la mesa lo reanude.</p>}
      {notice && (
        <button onClick={onCloseNotice} className="flex w-full items-center justify-between gap-3 rounded-2xl border box-warn px-4 py-3 text-left text-sm font-bold text-warn">
          {notice} <X size={16} className="shrink-0" />
        </button>
      )}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={'shrink-0 rounded-full border px-4 py-2 text-sm font-bold ' + (tab === k ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}>{l}</button>
        ))}
      </div>

      {tab === 'resumen' && (
        <div className="space-y-5">
          {(m.status === 'LIVE' || tick) && !over && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <ClockCard label="Partido" time={tick?.matchTime} paused={tick?.isMatchPaused ?? true} />
                <ClockCard label="Set" time={tick?.setTime} paused={tick?.isSetPaused ?? true} />
              </div>
              <TimeoutBanner tick={tick} nameA={m.teamA?.name ?? 'Equipo A'} nameB={m.teamB?.name ?? 'Equipo B'} />
            </>
          )}
          <PredictBox matchId={m.id} teamA={m.teamA} teamB={m.teamB} />
          {(m.sets?.length ?? 0) > 0 && <ScoreTimeline m={m} />}
          <Details m={m} />
        </div>
      )}
      {tab === 'alineacion' && <MatchRoster teamA={m.teamA} teamB={m.teamB} branch={m.branch} matchId={m.id} sanctions={{ items: sanctions, tick }} />}
      {tab === 'predicciones' && <PredictBox matchId={m.id} teamA={m.teamA} teamB={m.teamB} />}
      {tab === 'clasificacion' && <StandingsView branch={m.branch} tournamentId={m.tournament.id} finished={m.tournament.status === 'FINISHED'} />}
      {tab === 'cara' && <HeadToHead m={m} />}
    </div>
  )
}
