import { Fragment, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, Heart, Star } from 'lucide-react'
import MatchCard from '../MatchCard'
import MatchRow from '../MatchRow'
import GoTo from '../GoTo'
import { api } from '../../lib/api'
import { normMatch, phaseCmp, BRANCH, MODALITY } from '../../lib/format'
import { dayOf, dayTab } from '../../lib/days'
import { socket } from '../../sockets/socket'
import { useAuthStore } from '../../stores/authStore'
import { useFavorites } from '../../stores/favoritesStore'

const CAL_BACK = 90 // días hacia atrás que se cargan
const CAL_AHEAD = 180 // y hacia adelante
const RANK = { LIVE: 0, READY: 1, SCHEDULED: 2, SUSPENDED: 3, FINISHED: 4 }
const byTime = (a, b) => String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? '')) || phaseCmp(a, b) || (a.court || 999) - (b.court || 999)
const byStatus = (a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || byTime(a, b)
// Fecha del torneo sin la zona: la Fecha 1 junta los partidos de todas las zonas
const phaseText = (m) => m.phase?.label ?? 'Sin fase'
const tid = (m) => m.tournament?.id ?? 'none'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Inicio de todos los roles: tira de días (por jornada) y tira de torneos, con la lista agrupada por torneo.
export default function HomeInicio({ byId, loading, error, children }) {
  const [sp, setSp] = useSearchParams()
  const dPick = sp.get('d')
  const tPick = sp.get('t') || 'all'
  const [phasePick, setPhasePick] = useState('all')
  const [cal, setCal] = useState(null)
  const [calTry, setCalTry] = useState(0)
  const uid = useAuthStore((s) => s.user?.id)
  const { teams: favTeams, tournaments: favTours, loaded: favLoaded, load: loadFavs, clear: clearFavs } = useFavorites()
  useEffect(() => { if (uid) loadFavs(); else clearFavs() }, [uid])
  const favReady = !uid || favLoaded // hasta tener los favoritos no se elige día (evita saltos)
  const isFav = (m) => favTeams.has(m.teamA?.id) || favTeams.has(m.teamB?.id)
  const [lock, setLock] = useState(null) // pestaña elegida al entrar: después no se mueve sola

  const setParams = (changes) => {
    const n = new URLSearchParams(sp)
    Object.entries(changes).forEach(([k, v]) => (v == null || v === 'all' ? n.delete(k) : n.set(k, v)))
    setSp(n, { replace: true })
  }

  // Jornadas pasadas y futuras (incluye finalizados). Reintenta si falla y vuelve a pedir al reconectar
  useEffect(() => {
    let alive = true
    const iso = (d) => encodeURIComponent(new Date(Date.now() + d * 864e5).toISOString())
    const load = () =>
      api('GET', '/matches?status=LIVE,READY,SCHEDULED,SUSPENDED,FINISHED&includeUndated=true&limit=200&from=' + iso(-CAL_BACK) + '&to=' + iso(CAL_AHEAD))
        .then((r) => { if (alive) setCal(r.map(normMatch)) })
        .catch(() => { if (alive && calTry < 3) setTimeout(() => alive && setCalTry((n) => n + 1), 2000) })
    load()
    socket.on('connect', load)
    return () => { alive = false; socket.off('connect', load) }
  }, [calTry])

  // Los datos en vivo (socket) pisan a los cargados
  const all = useMemo(() => {
    const mp = new Map()
    ;(cal ?? []).forEach((m) => mp.set(m.id, m))
    Object.values(byId).forEach((m) => mp.set(m.id, { ...mp.get(m.id), ...m }))
    return [...mp.values()].filter((m) => m.status !== 'CANCELLED')
  }, [cal, byId])

  const v = useMemo(() => {
    const live = all.filter((m) => m.status === 'LIVE').sort(byTime)
    const undated = all.filter((m) => !m.scheduledAt && m.status !== 'FINISHED')
    const calDays = {}
    all.forEach((m) => { const d = dayOf(m.scheduledAt); if (d) (calDays[d] ??= []).push(m) })
    const dayKeys = Object.keys(calDays).sort()
    const today = dayOf(new Date())
    // Hasta que llega el calendario completo no se elige día (evita saltar de la jornada pasada a la próxima)
    const favDay = favTeams.size ? dayKeys.find((d) => d >= today && calDays[d].some(isFav)) : undefined // próximo día en que juega un equipo favorito
    const autoRaw = (cal === null && calTry < 3) || !favReady ? null : live.length ? 'live' : favDay ? favDay : dayKeys.includes(today) ? today : dayKeys.find((d) => d >= today) ?? dayKeys[dayKeys.length - 1] ?? (undated.length ? 'none' : null)
    const auto = lock === 'live' && !live.length ? autoRaw : lock ?? autoRaw // si terminó el último en vivo, vuelve al día
    const sel = dPick === 'live' || dPick === 'none' || (dPick && DATE_RE.test(dPick)) ? dPick : auto
    const tabs = [...new Set([...dayKeys, ...(sel && DATE_RE.test(sel) ? [sel] : [])])].sort()
    const dayList = sel === 'live' ? live : sel === 'none' ? undated : sel ? calDays[sel] ?? [] : []

    const tmap = new Map()
    all.forEach((m) => { if (!tmap.has(tid(m))) tmap.set(tid(m), { id: tid(m), name: m.tournament?.name ?? 'Amistoso', n: 0 }) })
    dayList.forEach((m) => { tmap.get(tid(m)).n++ })
    const tournaments = [...tmap.values()].sort((a, b) => favTours.has(b.id) - favTours.has(a.id) || (b.n > 0) - (a.n > 0) || a.name.localeCompare(b.name))
    const tCur = tPick !== 'all' && tmap.has(tPick) ? tPick : 'all'

    // Fechas del torneo elegido (Fecha 1, 2, Semifinal…), de cualquier día
    const phaseOpts = []
    if (tCur !== 'all') [...all].filter((m) => tid(m) === tCur).sort(phaseCmp).forEach((m) => { const k = phaseText(m); if (!phaseOpts.includes(k)) phaseOpts.push(k) })
    const phaseCur = phaseOpts.length > 1 && phaseOpts.includes(phasePick) ? phasePick : 'all'

    let shown = tCur === 'all' ? dayList : dayList.filter((m) => tid(m) === tCur)
    if (phaseCur !== 'all') shown = all.filter((m) => tid(m) === tCur && phaseText(m) === phaseCur)
    shown = [...shown].sort(byStatus)

    const groups = []
    if (sel !== 'live') shown.forEach((m) => {
      let g = groups.find((x) => x.id === tid(m))
      if (!g) groups.push((g = { id: tid(m), name: m.tournament?.name ?? 'Amistosos', modality: m.modality, branch: m.branch, list: [] }))
      g.list.push(m)
    })

    groups.sort((a, b) => favTours.has(b.id) - favTours.has(a.id))
    const mine = favTeams.size && sel && sel !== 'live' ? dayList.filter((m) => isFav(m) && (tCur === 'all' || tid(m) === tCur)).sort(byStatus) : []
    const favDays = new Set(Object.keys(calDays).filter((d) => calDays[d].some(isFav)))
    const liveSorted = [...live].sort((a, b) => isFav(b) - isFav(a))
    return { mine, favDays, liveSorted, autoRaw, dayCount: dayList.length, live, calDays, tabs, sel, tournaments, tCur, phaseOpts, phaseCur, shown, groups, hasUndated: undated.length > 0 }
  }, [all, cal, calTry, lock, dPick, tPick, phasePick, favTeams, favTours, favReady])

  useEffect(() => { if (lock === null && v.autoRaw) setLock(v.autoRaw) }, [lock, v.autoRaw])

  useEffect(() => {
    document.getElementById('daytab-' + v.sel)?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [v.sel, cal])

  const pill = (on) => 'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-bold ' + (on ? 'border-accent bg-accent text-black' : 'border-line bg-surface')
  const strip = '-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
  const countOf = (d) => v.calDays[d]?.length ?? 0
  // "En vivo" va en su lugar del tiempo: justo antes del primer día de hoy en adelante (o al final si no hay)
  const today = dayOf(new Date())
  const liveBefore = v.live.length ? v.tabs.find((d) => d >= today) ?? null : undefined
  const liveTab = v.live.length > 0 && (
    <button id="daytab-live" onClick={() => setParams({ d: 'live', t: null })} aria-pressed={v.sel === 'live'}
      className={'shrink-0 whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-bold ' + (v.sel === 'live' ? 'border-live bg-live text-black' : 'border-live/50 bg-surface text-live')}>
      En vivo ({v.live.length})
    </button>
  )

  return (
    <div className="space-y-4">
      {children}

      {/* Días */}
      <div className="flex items-center gap-2">
        <div className={strip + ' min-w-0 flex-1'}>
          <div className="flex gap-2">
            {v.tabs.map((d) => (
              <Fragment key={d}>
                {d === liveBefore && liveTab}
                <button id={'daytab-' + d} onClick={() => setParams({ d, t: null })} aria-pressed={v.sel === d} className={pill(v.sel === d)}>
                  {dayTab(d)}{countOf(d) ? ' · ' + countOf(d) : ''}
                  {v.favDays.has(d) && <span aria-label="Juega un equipo tuyo" className={'ml-1.5 inline-block h-2 w-2 rounded-full align-middle ' + (v.sel === d ? 'bg-black' : 'bg-accent')} />}
                </button>
              </Fragment>
            ))}
            {liveBefore === null && liveTab}
            {v.hasUndated && (
              <button id="daytab-none" onClick={() => setParams({ d: 'none', t: null })} aria-pressed={v.sel === 'none'} className={pill(v.sel === 'none')}>Sin fecha</button>
            )}
          </div>
        </div>
        <label className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface" aria-label="Elegir fecha">
          <CalendarDays size={18} />
          <input type="date" className="absolute inset-0 h-full w-full opacity-0" value={DATE_RE.test(v.sel ?? '') ? v.sel : ''}
            onChange={(e) => e.target.value && setParams({ d: e.target.value, t: null })} />
        </label>
      </div>

      {/* Torneos */}
      {v.sel !== 'live' && v.tournaments.length > 0 && (
        <div className={strip}>
          <div className="flex gap-2">
            <button onClick={() => { setParams({ t: null }); setPhasePick('all') }} aria-pressed={v.tCur === 'all'} className={pill(v.tCur === 'all')}>
              Todos{v.dayCount ? ' · ' + v.dayCount : ''}
            </button>
            {v.tournaments.map((t) => (
              <button key={t.id} onClick={() => { setParams({ t: t.id }); setPhasePick('all') }} aria-pressed={v.tCur === t.id}
                className={pill(v.tCur === t.id) + (t.n === 0 && v.tCur !== t.id ? ' opacity-50' : '')}>
                {favTours.has(t.id) && <Star size={13} className="mr-1 inline fill-current align-[-1px]" />}{t.name}{t.n ? ' · ' + t.n : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Fecha del torneo elegido */}
      {v.sel !== 'live' && v.phaseOpts.length > 1 && (
        <div className={strip}>
          <div className="flex gap-2">
            <button onClick={() => setPhasePick('all')} className={pill(v.phaseCur === 'all') + ' !py-1.5 !text-xs'}>Jornada actual</button>
            {v.phaseOpts.map((k) => (
              <button key={k} onClick={() => setPhasePick(k)} aria-pressed={v.phaseCur === k} className={pill(v.phaseCur === k) + ' !py-1.5 !text-xs'}>{k}</button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-danger">{error}</p>}
      {cal === null && calTry < 3 && <p className="text-muted">Cargando…</p>}

      {v.sel === 'live' ? (
        v.live.length ? <div className="space-y-4">{v.liveSorted.map((m) => <MatchCard key={m.id} m={m} featured />)}</div> : <p className="text-muted">No hay partidos en vivo.</p>
      ) : (
        <>
          {favTeams.size > 0 && v.sel && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted"><Heart size={14} className="fill-accent text-accent" /> Tus partidos</h2>
              {v.mine.length ? (
                <div className="overflow-hidden rounded-2xl border border-accent/40 bg-surface">
                  <div className="divide-y divide-line">
                    {v.mine.map((m) => (m.status === 'LIVE' ? <div key={m.id} className="p-2"><MatchCard m={m} /></div> : <MatchRow key={m.id} m={m} flat />))}
                  </div>
                </div>
              ) : (
                <p className="rounded-2xl border border-line bg-surface px-4 py-4 text-sm font-semibold text-muted">No seguís partidos en este día.</p>
              )}
              <h2 className="pt-2 text-xs font-bold uppercase tracking-widest text-muted">Todos los partidos</h2>
            </section>
          )}
          {v.groups.map((g) => (
            <section key={g.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                {g.id !== 'none'
                  ? <GoTo to={'/liga/' + g.id} className="min-w-0 truncate text-sm font-extrabold text-accent">{favTours.has(g.id) && <Star size={13} className="mr-1 inline fill-accent align-[-1px]" />}{g.name} ›</GoTo>
                  : <span className="min-w-0 truncate text-sm font-extrabold">{g.name}</span>}
                <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-muted">
                  {[MODALITY[g.modality], BRANCH[g.branch]].filter(Boolean).join(' · ')} · {g.list.length} {g.list.length === 1 ? 'partido' : 'partidos'}
                </span>
              </div>
              <div className="divide-y divide-line">
                {g.list.map((m) => (m.status === 'LIVE' ? <div key={m.id} className="p-2"><MatchCard m={m} /></div> : <MatchRow key={m.id} m={m} flat />))}
              </div>
            </section>
          ))}
          {v.groups.length === 0 && (cal !== null || calTry >= 3) && (
            <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-sm font-bold text-muted">
              {all.length === 0 ? 'No hay partidos.' : 'No hay partidos esta fecha.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
