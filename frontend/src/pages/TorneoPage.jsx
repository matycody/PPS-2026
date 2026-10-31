import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Trophy } from 'lucide-react'
import BackLink from '../components/BackLink'
import { api } from '../lib/api'
import { BRANCH, MODALITY, FORMAT, TSTATUS, CRITERIA, normMatch, phaseCmp } from '../lib/format'
import StandingsView from '../components/torneo/StandingsView'
import BracketView from '../components/torneo/BracketView'
import FixtureView from '../components/torneo/FixtureView'
import ExtraMatchesView from '../components/torneo/ExtraMatchesView'
import MatchRow from '../components/MatchRow'
import TeamBadge from '../components/TeamBadge'
import FavHeart from '../components/FavHeart'
import { inputCls } from '../components/ui'
import { socket } from '../sockets/socket'

const date = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) : null)
const byWhen = (a, b) => String(a.scheduledAt ?? '9999').localeCompare(String(b.scheduledAt ?? '9999')) || phaseCmp(a, b)
const SHOWN = 5 // partidos que muestra el Resumen en cada bloque

function Block({ title, action, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-xs font-bold uppercase tracking-widest">{title}</span>
        {action}
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-sm font-bold">{children}</span>
    </div>
  )
}

// Detalle público de un torneo: Resumen, Partidos, Clasificación, Playoffs, Equipos e Info
export default function TorneoPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const [t, setT] = useState(null)
  const [tab, setTab] = useState('resumen')
  const [err, setErr] = useState('')
  const [extra, setExtra] = useState(0) // partidos fuera del fixture: el bloque aparece solo si hay
  const [matches, setMatches] = useState(null)
  const [editions, setEditions] = useState([])

  useEffect(() => {
    setT(null); setTab('resumen'); setMatches(null)
    api('GET', '/tournaments/' + id).then(setT).catch((e) => setErr(e.message))
  }, [id])

  // Otras ediciones del mismo torneo (selector de año)
  useEffect(() => {
    if (!t) return
    api('GET', '/tournaments?limit=200').then((l) => setEditions(l.filter((x) => x.name === t.name && x.branch === t.branch && x.modality === t.modality && x.status !== 'DRAFT'))).catch(() => {})
  }, [t?.name, t?.branch, t?.modality]) // eslint-disable-line react-hooks/exhaustive-deps

  // Partidos del torneo y cantidad fuera del fixture; se refrescan cuando cambia algún partido
  useEffect(() => {
    let timer
    const load = () => {
      api('GET', '/tournaments/' + id + '/extra-matches').then((l) => setExtra(l.length)).catch(() => {})
      api('GET', '/matches?tournamentId=' + id + '&limit=200').then((r) => setMatches(r.map(normMatch))).catch(() => setMatches((m) => m ?? []))
    }
    const onUpdated = () => { clearTimeout(timer); timer = setTimeout(load, 1200) }
    load()
    socket.emit('matches:subscribe')
    // Pausa o reanudación del torneo: se vuelve a pedir (a quien no es organización le sale "no encontrado" mientras está pausado)
    const onTour = (p) => {
      if (p.tournamentId !== id) return
      api('GET', '/tournaments/' + id).then((d) => { setErr(''); setT(d); load() }).catch((e) => setErr(e.message))
    }
    socket.on('match:updated', onUpdated)
    socket.on('tournament:updated', onTour)
    return () => { clearTimeout(timer); socket.off('match:updated', onUpdated); socket.off('tournament:updated', onTour); socket.emit('matches:unsubscribe') }
  }, [id])

  const { upcoming, recent } = useMemo(() => {
    const list = matches ?? []
    const live = list.filter((m) => m.status === 'LIVE')
    const next = list.filter((m) => ['READY', 'SCHEDULED', 'SUSPENDED'].includes(m.status)).sort(byWhen)
    const done = list.filter((m) => m.status === 'FINISHED').sort((a, b) => String(b.finishedAt ?? b.scheduledAt ?? '').localeCompare(String(a.finishedAt ?? a.scheduledAt ?? '')))
    return { upcoming: [...live, ...next], recent: done }
  }, [matches])

  if (err) return <p className="text-danger">{err}</p>
  if (!t) return <p className="text-muted">Cargando…</p>

  const st = TSTATUS[t.status]
  const hasLeague = t.stages.some((s) => s.type === 'LEAGUE')
  const knockouts = t.stages.filter((s) => s.type === 'KNOCKOUT')
  const tabs = [
    ['resumen', 'Resumen'],
    ['partidos', 'Partidos'],
    ...(hasLeague ? [['tabla', 'Clasificación']] : []),
    ...(knockouts.length ? [['llave', knockouts.every((s) => s.isPromotion) ? 'Promoción' : 'Playoffs']] : []),
    ['equipos', 'Equipos'],
    ['estadisticas', 'Estadísticas'],
    ['info', 'Info'],
  ]
  const subtitle = [BRANCH[t.branch], MODALITY[t.modality], FORMAT[t.format]].filter(Boolean).join(' · ')

  return (
    <div className="space-y-4">
      <BackLink to="/liga" className="flex items-center gap-1 text-sm text-muted"><ArrowLeft size={16} /> Liga o copas</BackLink>

      <header className="rounded-3xl border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          <TeamBadge team={{ name: t.name, logo: t.logo }} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold">{t.name}{t.edition ? ' · ' + t.edition : ''}</h1>
            <div className="truncate text-sm text-muted">{subtitle}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className={'rounded-full px-2 py-0.5 text-xs font-bold uppercase ' + st.cls}>{st.label}</span>
              {t.champion && <span className="flex items-center gap-1 text-xs font-bold"><Trophy size={13} /> {t.champion.name}</span>}
            </div>
          </div>
          <FavHeart type="TOURNAMENT" id={t.id} name={t.name} />
        </div>
        {editions.length > 1 && (
          <select aria-label="Año" className={inputCls + ' mt-3 !w-auto !px-4 !py-2 text-sm font-bold'} value={t.id} onChange={(e) => nav('/liga/' + e.target.value)}>
            {[...editions].sort((a, b) => b.year - a.year).map((e) => <option key={e.id} value={e.id}>{e.year}{e.edition ? ' · ' + e.edition : ''}</option>)}
          </select>
        )}
      </header>

      <nav className="flex gap-6 overflow-x-auto border-b border-line" aria-label="Secciones del torneo">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            aria-current={tab === k ? 'page' : undefined}
            className={'shrink-0 border-b-2 pb-2.5 text-sm font-bold ' + (tab === k ? 'border-accent text-accent' : 'border-transparent text-muted')}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'resumen' && (
        <div className="space-y-4">
          {t.champion && (
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
              <Trophy size={28} className="shrink-0 text-warn" />
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-widest text-muted">Campeón</div>
                <div className="truncate text-lg font-extrabold">{t.champion.name}</div>
              </div>
            </div>
          )}
          {matches === null && <p className="text-muted">Cargando…</p>}
          {matches && upcoming.length > 0 && (
            <Block title={upcoming.some((m) => m.status === 'LIVE') ? 'En vivo y próximos' : 'Próximos partidos'} action={upcoming.length > SHOWN && <button onClick={() => setTab('partidos')} className="flex items-center text-xs font-bold text-accent">Ver todos <ChevronRight size={14} /></button>}>
              <div className="divide-y divide-line">{upcoming.slice(0, SHOWN).map((m) => <MatchRow key={m.id} m={m} flat />)}</div>
            </Block>
          )}
          {matches && recent.length > 0 && (
            <Block title="Últimos resultados" action={recent.length > SHOWN && <button onClick={() => setTab('partidos')} className="flex items-center text-xs font-bold text-accent">Ver todos <ChevronRight size={14} /></button>}>
              <div className="divide-y divide-line">{recent.slice(0, SHOWN).map((m) => <MatchRow key={m.id} m={m} flat />)}</div>
            </Block>
          )}
          {matches && upcoming.length === 0 && recent.length === 0 && (
            <div className="rounded-2xl border border-line bg-surface p-4 text-sm">Todavía no hay partidos cargados en este torneo.</div>
          )}
          {hasLeague && <button onClick={() => setTab('tabla')} className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-bold">Ver clasificación <ChevronRight size={16} className="text-muted" /></button>}
        </div>
      )}

      {tab === 'partidos' && (
        <div className="space-y-6">
          <FixtureView tournamentId={t.id} />
          {extra > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-widest text-muted">Fuera del fixture</div>
              <ExtraMatchesView tournamentId={t.id} />
            </div>
          )}
        </div>
      )}

      {tab === 'tabla' && <StandingsView branch={t.branch} tournamentId={t.id} finished={t.status === 'FINISHED'} />}

      {tab === 'llave' && knockouts.map((s) => (
        <div key={s.id} className="rounded-3xl border border-line bg-bg p-3 space-y-2">
          <div className="text-xs font-bold uppercase tracking-widest text-muted">{s.name}</div>
          <BracketView branch={t.branch} tournamentId={t.id} stageId={s.id} roundTitle={s.isPromotion ? 'Promoción ' + t.name : null} />
        </div>
      ))}

      {tab === 'equipos' && (
        <Block title={t.teams.length + (t.teams.length === 1 ? ' equipo' : ' equipos')}>
          {t.teams.length === 0 && <div className="px-4 py-3 text-sm">Todavía no hay equipos inscriptos.</div>}
          <div className="divide-y divide-line">
            {t.teams.map(({ team }) => (
              <div key={team.id} className="flex items-center gap-3 px-3 py-2.5">
                <Link to={'/equipo/' + team.id} className="flex min-w-0 flex-1 items-center gap-3">
                  <TeamBadge team={team} size="sm" branch={t.branch} />
                  <span className="truncate font-bold">{team.name}</span>
                </Link>
                <FavHeart type="TEAM" id={team.id} name={team.name} compact />
              </div>
            ))}
          </div>
        </Block>
      )}

      {tab === 'estadisticas' && (
        <div className="rounded-2xl border border-line bg-surface px-4 py-10 text-center">
          <div className="text-lg font-extrabold">Próximamente</div>
          <div className="mt-1 text-sm text-muted">Las estadísticas del torneo van a estar disponibles muy pronto.</div>
        </div>
      )}

      {tab === 'info' && (
        <Block title="Información del torneo">
          <Row label="Formato">{FORMAT[t.format]}</Row>
          <Row label="Rama">{BRANCH[t.branch]}</Row>
          <Row label="Modalidad">{MODALITY[t.modality]}</Row>
          <Row label="Año">{t.year}{t.edition ? ' · ' + t.edition : ''}</Row>
          <Row label="Estado">{st.label}</Row>
          {(t.startsAt || t.endsAt) && <Row label="Fechas">{[date(t.startsAt), date(t.endsAt)].filter(Boolean).join(' → ')}</Row>}
          <Row label="Equipos">{t.teams.length}</Row>
          <Row label="Puntos">Victoria {t.pointsWin} · Empate {t.pointsDraw} · Derrota {t.pointsLoss}</Row>
          {hasLeague && t.tiebreakers?.length > 0 && <Row label="Desempates">{t.tiebreakers.map((x) => CRITERIA[x.criterion]).join(' → ')}</Row>}
          {t.champion && <Row label="Campeón">{t.champion.name}</Row>}
        </Block>
      )}
    </div>
  )
}
