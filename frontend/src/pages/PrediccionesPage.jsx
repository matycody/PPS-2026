import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { dayOf, dayTab } from '../lib/days'
import { Skeleton } from '../components/ui'
import PredictCard, { fmtCuota, fmtMult } from '../components/PredictCard'

const TABS = [['calendario', 'Calendario'], ['torneos', 'Torneos'], ['favoritos', 'Favoritos'], ['mias', 'Mis predicciones'], ['clasificacion', 'Clasificación']]
const PICK = (p, m) => (p === 'A' ? m.teamA?.name : p === 'B' ? m.teamB?.name : 'Empate')
const RESULT = {
  HIT: { label: 'Acertó', cls: 'bg-live/15 text-live' },
  MISS: { label: 'Falló', cls: 'bg-danger/15 text-danger' },
  PENDING: { label: 'Pendiente', cls: 'bg-surface-2 text-muted' },
  VOID: { label: 'Sin resultado', cls: 'bg-surface-2 text-muted' },
}
const maxCuota = (m) => Math.max(m.prode.odds.A.cuota ?? 0, m.prode.odds.B.cuota ?? 0)

const Pill = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick} className={'shrink-0 rounded-full border px-4 py-2 text-sm font-bold ' + (on ? 'border-accent bg-accent text-black' : 'border-line bg-surface')}>{children}</button>
)
const Empty = ({ children }) => <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">{children}</p>

// Destacados: tres carruseles con los partidos abiertos más llamativos
function Destacados({ open, renderCard }) {
  const groups = useMemo(() => {
    const free = open.filter((m) => m.prode.open && !m.prode.blocked)
    const byDate = (a, b) => String(a.scheduledAt ?? '9').localeCompare(String(b.scheduledAt ?? '9'))
    return [
      ['Batacazos', 'las cuotas más altas', [...free].sort((a, b) => maxCuota(b) - maxCuota(a)).slice(0, 5)],
      ['Cierran pronto', 'los que se juegan antes', free.filter((m) => m.scheduledAt).sort(byDate).slice(0, 5)],
      ['Máximo bonus', 'los que más multiplican hoy', [...free].filter((m) => m.prode.bonus.mult > 1).sort((a, b) => b.prode.bonus.mult - a.prode.bonus.mult || byDate(a, b)).slice(0, 5)],
    ].filter(([, , l]) => l.length)
  }, [open])
  if (!groups.length) return null
  return (
    <div className="space-y-4">
      {groups.map(([title, sub, list]) => (
        <section key={title}>
          <p className="mb-2 flex items-baseline gap-2"><span className="text-sm font-extrabold">{title}</span><span className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] text-muted [text-shadow:none]">{sub}</span></p>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
            {list.map((m) => <div key={m.id} className="w-[85%] max-w-sm shrink-0 snap-start">{renderCard(m)}</div>)}
          </div>
        </section>
      ))}
    </div>
  )
}

function ByDay({ list, renderCard, limit = 6 }) {
  const [all, setAll] = useState(false)
  const days = useMemo(() => {
    const map = new Map()
    for (const m of list) {
      const d = dayOf(m.scheduledAt) ?? 'sin-fecha'
      if (!map.has(d)) map.set(d, [])
      map.get(d).push(m)
    }
    return [...map].sort(([a], [b]) => (a === 'sin-fecha') - (b === 'sin-fecha') || a.localeCompare(b))
  }, [list])
  if (!days.length) return <Empty>No hay partidos abiertos para predecir.</Empty>
  return (
    <div className="space-y-4">
      {(all ? days : days.slice(0, limit)).map(([d, ms]) => (
        <section key={d} className="space-y-2">
          <p className="text-sm font-extrabold">{d === 'sin-fecha' ? 'Sin fecha' : dayTab(d)}</p>
          {ms.map((m) => <div key={m.id}>{renderCard(m)}</div>)}
        </section>
      ))}
      {days.length > limit && <button type="button" onClick={() => setAll((v) => !v)} className="w-full rounded-2xl border border-line bg-surface py-2 text-sm font-bold">{all ? 'Ver menos' : 'Ver todos los días (' + days.length + ')'}</button>}
    </div>
  )
}

function Rank({ data, empty }) {
  if (!data) return <Skeleton />
  if (data.total === 0) return <Empty>{empty}</Empty>
  return (
    <div className="space-y-3">
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {data.top.map((e) => (
          <div key={e.userId} className={'flex items-center gap-3 px-3 py-3 ' + (e.isMe ? 'bg-surface-2' : '')}>
            <span className="w-7 text-center text-sm font-extrabold tabular-nums">{e.position}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold">{e.name}{e.isMe ? ' (vos)' : ''}</span>
            <span className="text-xs text-muted">{e.hits}/{e.played}</span>
            <span className="w-16 text-right text-sm font-extrabold tabular-nums">{e.points} pts</span>
          </div>
        ))}
      </div>
      {data.me && data.me.position > data.top.length && <p className="text-center text-sm">Estás en el puesto {data.me.position} con {data.me.points} pts.</p>}
    </div>
  )
}

// Predicciones: predecí quién gana cada partido antes de que se habilite. Cuotas, bonus por anticipación y ranking. Es un juego, no hay dinero.
export default function PrediccionesPage() {
  const [tab, setTab] = useState('calendario')
  const [open, setOpen] = useState(null)
  const [me, setMe] = useState(null)
  const [favs, setFavs] = useState(null)
  const [err, setErr] = useState('')
  const [tId, setTId] = useState(null) // torneo elegido en la pestaña Torneos
  const [mineView, setMineView] = useState('abiertas')
  const [rankScope, setRankScope] = useState('general') // 'general' o id de torneo
  const [rank, setRank] = useState({})
  const [tRank, setTRank] = useState(null)

  const loadMe = useCallback(() => api('GET', '/predictions/me').then(setMe).catch((e) => setErr(e.message)), [])
  useEffect(() => {
    api('GET', '/predictions/open').then(setOpen).catch((e) => setErr(e.message))
    loadMe()
    api('GET', '/favorites').then(setFavs).catch(() => setFavs([]))
  }, [loadMe])

  // Elegir una opción; tocar la misma otra vez la quita. Devuelve el texto del error si falla.
  const onPick = async (matchId, p) => {
    try {
      const cur = open.find((m) => m.id === matchId)?.prode.pick
      if (cur === p) await api('DELETE', '/predictions/match/' + matchId)
      else await api('POST', '/predictions', { matchId, pick: p })
      const r = await api('GET', '/predictions/matches?ids=' + matchId)
      setOpen((list) => list.map((m) => (m.id === matchId && r[matchId] ? { ...m, prode: r[matchId] } : m)))
      loadMe()
      return ''
    } catch (e) {
      return e.message
    }
  }
  const renderCard = (m) => <PredictCard m={m} info={m.prode} onPick={onPick} />

  const tournaments = useMemo(() => {
    const map = new Map()
    for (const m of open ?? []) if (m.tournament) map.set(m.tournament.id, m.tournament)
    for (const p of me?.predictions ?? []) if (p.match.tournament) map.set(p.match.tournament.id, p.match.tournament)
    return [...map.values()]
  }, [open, me])
  const openTournaments = useMemo(() => {
    const ids = new Set((open ?? []).map((m) => m.tournamentId))
    return tournaments.filter((t) => ids.has(t.id))
  }, [open, tournaments])
  const curT = tId ?? openTournaments[0]?.id ?? null

  useEffect(() => {
    if (tab !== 'torneos' || !curT) return
    setTRank(null)
    api('GET', '/predictions/ranking?tournamentId=' + curT).then(setTRank).catch(() => setTRank({ total: 0, top: [], me: null }))
  }, [tab, curT])
  useEffect(() => {
    if (tab !== 'clasificacion' || rank[rankScope]) return
    api('GET', '/predictions/ranking' + (rankScope === 'general' ? '' : '?tournamentId=' + rankScope))
      .then((r) => setRank((x) => ({ ...x, [rankScope]: r })))
      .catch((e) => setErr(e.message))
  }, [tab, rankScope, rank])

  const favMatches = useMemo(() => {
    const teams = new Set((favs ?? []).filter((f) => f.targetType === 'TEAM').map((f) => f.targetId))
    const tours = new Set((favs ?? []).filter((f) => f.targetType === 'TOURNAMENT').map((f) => f.targetId))
    return (open ?? []).filter((m) => teams.has(m.teamA?.id) || teams.has(m.teamB?.id) || tours.has(m.tournamentId))
  }, [open, favs])

  const mias = useMemo(() => (me?.predictions ?? []).filter((p) => (mineView === 'abiertas' ? p.result === 'PENDING' && !p.voidReason : p.result !== 'PENDING' || p.voidReason)), [me, mineView])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Predicciones</h1>
        <p className="text-sm text-muted">Elegí quién gana antes de que se habilite el partido. Cuanto más alta la cuota y más temprano predecís, más puntos. Es un juego, no hay dinero.</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Puntos', me ? me.total : '–'], ['Puesto', me?.position ? me.position + '°' : '–'], ['Racha', me ? me.streak : '–']].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-line bg-surface p-3">
            <p className="text-2xl font-extrabold tabular-nums">{v}</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{l}</p>
          </div>
        ))}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4" role="tablist">
        {TABS.map(([k, l]) => <Pill key={k} on={tab === k} onClick={() => setTab(k)}>{l}</Pill>)}
      </div>
      {err && <p className="text-sm text-danger">{err}</p>}

      {(me?.predictions ?? []).filter((p) => p.voidReason).map((p) => (
        <div key={p.matchId} className="rounded-2xl border box-warn px-4 py-3 text-sm">
          <p className="font-bold text-warn">Tu predicción no es válida</p>
          <p className="mt-0.5 text-xs">{p.match.teamA?.name} vs {p.match.teamB?.name}: {p.voidReason}</p>
        </div>
      ))}

      {tab === 'calendario' && (open === null ? <Skeleton /> : (
        <div className="space-y-5">
          <Destacados open={open} renderCard={renderCard} />
          <ByDay list={open} renderCard={renderCard} />
        </div>
      ))}

      {tab === 'torneos' && (open === null ? <Skeleton /> : openTournaments.length === 0 ? <Empty>No hay torneos con partidos abiertos.</Empty> : (
        <div className="space-y-4">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
            {openTournaments.map((t) => <Pill key={t.id} on={curT === t.id} onClick={() => setTId(t.id)}>{t.name}</Pill>)}
          </div>
          <ByDay list={open.filter((m) => m.tournamentId === curT)} renderCard={(m) => <PredictCard m={m} info={m.prode} onPick={onPick} showTournament={false} />} />
          <section className="space-y-2">
            <p className="text-sm font-extrabold">Ranking del torneo</p>
            <Rank data={tRank} empty="El ranking de este torneo arranca cuando termine el primer partido con predicciones." />
          </section>
        </div>
      ))}

      {tab === 'favoritos' && (open === null || favs === null ? <Skeleton /> : favMatches.length === 0 ? (
        <Empty>No hay partidos abiertos de tus equipos o torneos favoritos. Marcalos con el corazón desde su ficha o desde <Link to="/favoritos" className="font-bold text-accent">Favoritos</Link>.</Empty>
      ) : <ByDay list={favMatches} renderCard={renderCard} />)}

      {tab === 'mias' && (me === null ? <Skeleton /> : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Pill on={mineView === 'abiertas'} onClick={() => setMineView('abiertas')}>Abiertas</Pill>
            <Pill on={mineView === 'resueltas'} onClick={() => setMineView('resueltas')}>Resueltas</Pill>
          </div>
          {mias.length === 0 && <Empty>{mineView === 'abiertas' ? 'No tenés predicciones esperando resultado. Elegí un partido en el Calendario.' : 'Todavía no se resolvió ninguna de tus predicciones.'}</Empty>}
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface empty:hidden">
            {mias.map((p) => {
              const r = p.voidReason ? { label: 'Anulada', cls: 'bg-warn/15 text-warn' } : RESULT[p.result]
              return (
                <Link key={p.matchId} to={'/partido/' + p.matchId} className="flex items-center justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{p.match.teamA?.name} vs {p.match.teamB?.name}</p>
                    <p className="truncate text-xs text-muted">Elegiste: {PICK(p.pick, p.match)}{p.cuota ? ' · cuota ' + fmtCuota(p.cuota) : ''}{p.bonus > 1 ? ' · bonus ' + fmtMult(p.bonus) : ''}</p>
                  </div>
                  <span className={'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase ' + r.cls}>
                    {p.result === 'HIT' ? '+' + p.earned : p.result === 'PENDING' ? '+' + p.points + ' pts' : r.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      ))}

      {tab === 'clasificacion' && (
        <div className="space-y-3">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
            <Pill on={rankScope === 'general'} onClick={() => setRankScope('general')}>General {new Date().getFullYear()}</Pill>
            {tournaments.map((t) => <Pill key={t.id} on={rankScope === t.id} onClick={() => setRankScope(t.id)}>{t.name}</Pill>)}
          </div>
          <Rank data={rank[rankScope]} empty="El ranking arranca cuando termine el primer partido con predicciones." />
        </div>
      )}
    </div>
  )
}
