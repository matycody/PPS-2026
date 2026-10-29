import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { api } from '../lib/api'
import TeamBadge from '../components/TeamBadge'
import MatchRow from '../components/MatchRow'
import FavHeart from '../components/FavHeart'
import { BRANCH, MODALITY, normMatch } from '../lib/format'
import { dayOf, dayTab } from '../lib/days'
import { useFavorites } from '../stores/favoritesStore'

const BACK = 30 // días hacia atrás
const AHEAD = 120 // y hacia adelante
const PAST_DAYS = 5 // jornadas pasadas que se muestran
const byTime = (a, b) => String(a.scheduledAt ?? '').localeCompare(String(b.scheduledAt ?? '')) || (a.court || 999) - (b.court || 999)
const pathOf = (f) => (f.targetType === 'TEAM' ? '/equipo/' : f.targetType === 'TOURNAMENT' ? '/liga/' : '/jugador/') + f.targetId

// Favoritos: solo lo que la persona sigue (tira arriba) y los partidos de esos equipos y torneos, por día y por torneo.
export default function FavoritosPage() {
  const { teams: favTeams, tournaments: favTours, players: favPlayers, load } = useFavorites()
  const [favs, setFavs] = useState(null)
  const [cal, setCal] = useState(null)
  const [adding, setAdding] = useState(false)
  const [teams, setTeams] = useState([])
  const [tournaments, setTournaments] = useState([])
  const [err, setErr] = useState('')

  useEffect(() => { load() }, [load])
  // La tira se vuelve a pedir cada vez que cambia lo que se sigue
  useEffect(() => {
    api('GET', '/favorites').then(setFavs).catch((e) => setErr(e.message))
  }, [favTeams, favTours, favPlayers])

  useEffect(() => {
    const iso = (d) => new Date(Date.now() + d * 864e5).toLocaleDateString('en-CA')
    api('GET', '/matches?status=LIVE,READY,SCHEDULED,SUSPENDED,FINISHED&limit=200&from=' + iso(-BACK) + '&to=' + iso(AHEAD))
      .then((r) => setCal(r.map(normMatch)))
      .catch((e) => setErr(e.message))
  }, [])

  // El catálogo para sumar favoritos solo se pide al abrir el "+"
  useEffect(() => {
    if (!adding || teams.length || tournaments.length) return
    api('GET', '/teams').then(setTeams).catch((e) => setErr(e.message))
    api('GET', '/tournaments?limit=200').then(setTournaments).catch((e) => setErr(e.message))
  }, [adding, teams.length, tournaments.length])

  const days = useMemo(() => {
    const mine = (cal ?? []).filter((m) => m.scheduledAt && (favTeams.has(m.teamA?.id) || favTeams.has(m.teamB?.id) || favTours.has(m.tournament?.id)))
    const today = dayOf(new Date().toISOString())
    const map = new Map()
    mine.forEach((m) => {
      const d = dayOf(m.scheduledAt)
      if (!map.has(d)) map.set(d, [])
      map.get(d).push(m)
    })
    const keys = [...map.keys()].sort()
    const ahead = keys.filter((d) => d >= today)
    const past = keys.filter((d) => d < today).slice(-PAST_DAYS).reverse()
    const build = (d) => {
      const groups = []
      map.get(d).sort(byTime).forEach((m) => {
        const id = m.tournament?.id ?? 'none'
        let g = groups.find((x) => x.id === id)
        if (!g) groups.push((g = { id, name: m.tournament?.name ?? 'Amistosos', list: [] }))
        g.list.push(m)
      })
      return { day: d, groups }
    }
    return { ahead: ahead.map(build), past: past.map(build) }
  }, [cal, favTeams, favTours])

  const nothing = favs?.length === 0
  const section = ({ day, groups }) => (
    <section key={day} className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted">{dayTab(day)}</h2>
      {groups.map((g) => (
        <div key={g.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
          {g.id === 'none' ? (
            <div className="border-b border-line px-3 py-2 text-xs font-bold uppercase tracking-wide">{g.name}</div>
          ) : (
            <Link to={'/liga/' + g.id} className="block border-b border-line px-3 py-2 text-xs font-bold uppercase tracking-wide">{g.name}</Link>
          )}
          <div className="divide-y divide-line">
            {g.list.map((m) => <MatchRow key={m.id} m={m} flat />)}
          </div>
        </div>
      ))}
    </section>
  )

  return (
    <div className="space-y-5">
      {err && <p className="text-danger">{err}</p>}

      <div className="flex items-start gap-2 overflow-hidden rounded-2xl border border-line bg-surface p-3">
        <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto pb-1">
          {(favs ?? []).map((f) => {
            const name = f.targetType === 'PLAYER' ? (f.nickname || f.name) : f.name
            return (
              <Link key={f.targetType + f.targetId} to={pathOf(f)} className="flex w-16 shrink-0 flex-col items-center gap-1">
                <TeamBadge team={{ name, logo: f.logo }} size="lg" />
                <span className="w-full truncate text-center text-[11px] font-semibold">{name}</span>
              </Link>
            )
          })}
          {favs === null && <span className="py-4 text-sm text-muted">Cargando…</span>}
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          aria-label={adding ? 'Cerrar' : 'Agregar favoritos'}
          className="grid h-12 w-12 shrink-0 place-items-center self-center rounded-full bg-surface-2 text-muted"
        >
          {adding ? <X size={22} /> : <Plus size={22} />}
        </button>
      </div>

      {adding && (
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Torneos</h2>
          <div className="space-y-2">
            {tournaments.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                <TeamBadge team={t} />
                <Link to={'/liga/' + t.id} className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{t.name}</span>
                  <span className="block truncate text-[11px] font-semibold uppercase text-muted">{[MODALITY[t.modality], BRANCH[t.branch]].filter(Boolean).join(' · ')}</span>
                </Link>
                <FavHeart type="TOURNAMENT" id={t.id} name={t.name} />
              </div>
            ))}
          </div>
          <h2 className="pt-2 text-xs font-bold uppercase tracking-widest text-muted">Equipos</h2>
          <div className="space-y-2">
            {teams.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                <TeamBadge team={t} />
                <Link to={'/equipo/' + t.id} className="min-w-0 flex-1 truncate font-bold">{t.name}</Link>
                <FavHeart type="TEAM" id={t.id} name={t.name} />
              </div>
            ))}
          </div>
        </div>
      )}

      {!adding && (
        <>
          {nothing && (
            <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
              Todavía no seguís a nadie. Tocá <strong>+</strong> para elegir tus equipos y torneos, o el corazón dentro de un partido, equipo o jugador.
            </div>
          )}
          {!nothing && favs !== null && cal !== null && days.ahead.length + days.past.length === 0 && (
            <div className="rounded-2xl border border-line bg-surface p-4 text-sm">Tus equipos y torneos no tienen partidos cargados por ahora.</div>
          )}
          {days.ahead.map(section)}
          {days.past.length > 0 && <h2 className="pt-2 text-xs font-bold uppercase tracking-widest text-muted">Anteriores</h2>}
          {days.past.map(section)}
        </>
      )}
    </div>
  )
}
