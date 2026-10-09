import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { api } from '../lib/api'
import { inputCls } from '../components/ui'
import TeamBadge from '../components/TeamBadge'

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3 text-center">
      <p className="text-2xl font-extrabold">{value}</p>
      <p className="text-[11px] uppercase text-muted">{label}</p>
    </div>
  )
}

function TeamStats({ teamId, filter }) {
  const [d, setD] = useState(null)
  useEffect(() => {
    setD(null)
    api('GET', '/stats/teams/' + teamId + filter).then(setD).catch(() => setD(false))
  }, [teamId, filter])
  if (d === null) return <p className="text-muted">Cargando…</p>
  if (d === false) return <p className="text-danger">No se pudieron cargar las estadísticas.</p>
  const r = d.record
  return (
    <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <Link to={'/equipo/' + d.team.id} className="flex items-center gap-3">
        <TeamBadge team={d.team} size="lg" />
        <div>
          <p className="font-extrabold">{d.team.name}</p>
          <p className="flex items-center gap-1 text-sm text-muted"><Trophy size={14} /> {d.titles} títulos · {d.tournamentsPlayed} torneos</p>
        </div>
      </Link>
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Jugados" value={r.played} />
        <Stat label="Ganados" value={r.won} />
        <Stat label="Empates" value={r.drawn} />
        <Stat label="Perdidos" value={r.lost} />
      </div>
      <p className="text-sm text-muted">Sets a favor {r.setsFor} · en contra {r.setsAgainst}</p>
      {d.history.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Historial</p>
          {d.history.map((h, i) => (
            <Link key={i} to={'/liga/' + h.tournamentId} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{h.year} · {h.tournament} · {h.stage}</span>
              <span className="shrink-0 font-bold">{h.position}.º · {h.points} pts</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function HeadToHead({ teams, filter }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [d, setD] = useState(null)
  useEffect(() => {
    if (!a || !b || a === b) { setD(null); return }
    api('GET', '/stats/head-to-head?teamA=' + a + '&teamB=' + b + filter.replace('?', '&')).then(setD).catch(() => setD(null))
  }, [a, b, filter])
  return (
    <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <p className="text-sm font-bold">Cara a cara</p>
      <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
        <select className={inputCls} value={a} onChange={(e) => setA(e.target.value)}>
          <option value="">Equipo A</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className={inputCls} value={b} onChange={(e) => setB(e.target.value)}>
          <option value="">Equipo B</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      {d && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label={d.teamA.name} value={d.winsA} />
            <Stat label="Empates" value={d.draws} />
            <Stat label={d.teamB.name} value={d.winsB} />
          </div>
          {d.matches.map((m) => (
            <Link key={m.id} to={'/partido/' + m.id} className="flex justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="truncate text-muted">{m.tournament.name}</span>
              <span className="font-bold">{m.setsA} - {m.setsB}</span>
            </Link>
          ))}
          {d.played === 0 && <p className="text-sm text-muted">Todavía no jugaron entre sí.</p>}
        </>
      )}
    </div>
  )
}

export default function EstadisticasPage() {
  const [champ, setChamp] = useState(null)
  const [teams, setTeams] = useState([])
  const [team, setTeam] = useState('')
  const [yf, setYf] = useState('')
  const [yt, setYt] = useState('')
  const filter = '?' + [yf && 'yearFrom=' + yf, yt && 'yearTo=' + yt].filter(Boolean).join('&')

  useEffect(() => { api('GET', '/teams').then((d) => setTeams([...d].sort((x, y) => x.name.localeCompare(y.name)))).catch(() => {}) }, [])
  useEffect(() => { api('GET', '/stats/champions' + filter).then(setChamp).catch(() => setChamp(false)) }, [filter])

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Estadísticas</h1>
      <div className="grid grid-cols-2 gap-3 text-xs text-muted [&>*]:min-w-0">
        <label>Desde el año<input type="number" className={inputCls} value={yf} onChange={(e) => setYf(e.target.value)} /></label>
        <label>Hasta el año<input type="number" className={inputCls} value={yt} onChange={(e) => setYt(e.target.value)} /></label>
      </div>

      <div className="space-y-2 rounded-3xl border border-line bg-surface p-4">
        <p className="text-sm font-bold">Campeones</p>
        {champ === null && <p className="text-muted">Cargando…</p>}
        {champ && champ.tournaments.length === 0 && <p className="text-sm text-muted">Todavía no hay torneos finalizados.</p>}
        {champ && champ.titles.length > 0 && (
          <div className="space-y-1">
            {champ.titles.map((x) => (
              <Link key={x.team.id} to={'/equipo/' + x.team.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <TeamBadge team={x.team} size="sm" />
                <span className="flex-1 truncate font-semibold">{x.team.name}</span>
                <span className="flex items-center gap-1 font-bold"><Trophy size={14} /> {x.titles}</span>
              </Link>
            ))}
          </div>
        )}
        {champ && champ.tournaments.map((t) => (
          <Link key={t.id} to={'/liga/' + t.id} className="flex justify-between text-sm text-muted">
            <span className="truncate">{t.year} · {t.name}</span><span className="shrink-0 font-semibold text-fg">{t.champion.name}</span>
          </Link>
        ))}
      </div>

      <select className={inputCls} value={team} onChange={(e) => setTeam(e.target.value)}>
        <option value="">Ver estadísticas de un equipo…</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {team && <TeamStats teamId={team} filter={filter === '?' ? '' : filter} />}

      <HeadToHead teams={teams} filter={filter === '?' ? '' : filter} />
    </div>
  )
}
