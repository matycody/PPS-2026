import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, Search, ChevronRight, Swords } from 'lucide-react'
import { api } from '../lib/api'
import { BRANCH, MODALITY } from '../lib/format'
import { inputCls } from '../components/ui'
import TeamBadge from '../components/TeamBadge'

const TABS = [['resumen', 'Resumen'], ['torneos', 'Torneos'], ['equipos', 'Equipos'], ['cara', 'Cara a cara']]
const YEAR = new Date().getFullYear()
const YEARS = [YEAR, YEAR - 1, YEAR - 2]

const Chip = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick} className={'shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ' + (on ? 'border-accent bg-accent text-black' : 'border-line bg-surface text-muted')}>{children}</button>
)

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3 text-center">
      <p className="text-2xl font-extrabold">{value}</p>
      <p className="text-[11px] uppercase text-muted">{label}</p>
    </div>
  )
}

const Card = ({ title, children }) => (
  <section className="space-y-3 rounded-3xl border border-line bg-surface p-4">
    {title && <p className="text-xs font-bold uppercase tracking-widest text-muted">{title}</p>}
    {children}
  </section>
)

const RESULT_CLS = { CHAMPION: 'bg-accent text-black', RUNNER_UP: 'bg-surface-2 text-fg', THIRD: 'bg-surface-2 text-fg' }

function TeamStats({ teamId, filter }) {
  const [d, setD] = useState(null)
  useEffect(() => {
    setD(null)
    api('GET', '/stats/teams/' + teamId + filter).then(setD).catch(() => setD(false))
  }, [teamId, filter])
  if (d === null) return <p className="text-muted">Cargando…</p>
  if (d === false) return <p className="text-danger">No se pudieron cargar las estadísticas.</p>
  const r = d.record
  const pct = r.played ? Math.round((r.won / r.played) * 100) : 0
  return (
    <Card>
      <Link to={'/equipo/' + d.team.id} className="flex items-center gap-3">
        <TeamBadge team={d.team} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold">{d.team.name}</p>
          <p className="flex items-center gap-1 text-sm text-muted"><Trophy size={14} className="text-accent" /> {d.titles} {d.titles === 1 ? 'título' : 'títulos'} · {d.tournamentsPlayed} torneos</p>
        </div>
        <ChevronRight size={18} className="text-muted" />
      </Link>
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Jugados" value={r.played} />
        <Stat label="Ganados" value={r.won} />
        <Stat label="Empates" value={r.drawn} />
        <Stat label="Perdidos" value={r.lost} />
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-muted"><span>Efectividad</span><span className="font-bold text-fg">{pct}%</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-accent" style={{ width: pct + '%' }} /></div>
      </div>
      <p className="text-sm text-muted">Sets a favor <b className="text-fg">{r.setsFor}</b> · en contra <b className="text-fg">{r.setsAgainst}</b></p>
      {(d.career ?? []).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Torneos</p>
          {d.career.map((c) => (
            <Link key={c.tournamentId} to={'/liga/' + c.tournamentId} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{c.year} · {c.tournament}{c.edition ? ' · ' + c.edition : ''}</span>
              <span className={'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ' + (RESULT_CLS[c.result?.kind] ?? 'bg-surface text-muted')}>{c.result?.label ?? '—'}</span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}

function TeamPicker({ teams, value, onChange, placeholder }) {
  const sel = teams.find((t) => t.id === value)
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-line bg-surface p-2">
      {sel ? <TeamBadge team={sel} size="sm" /> : <div className="h-8 w-8 shrink-0 rounded-full bg-surface-2" />}
      <select className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
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
  const tot = d ? d.winsA + d.draws + d.winsB : 0
  const w = (n) => (tot ? (n / tot) * 100 : 0) + '%'
  return (
    <Card title="Cara a cara">
      <div className="grid grid-cols-1 gap-2">
        <TeamPicker teams={teams} value={a} onChange={setA} placeholder="Equipo A" />
        <div className="flex items-center gap-2 text-xs font-bold uppercase text-muted"><span className="h-px flex-1 bg-line" /><Swords size={14} /> vs <span className="h-px flex-1 bg-line" /></div>
        <TeamPicker teams={teams} value={b} onChange={setB} placeholder="Equipo B" />
      </div>
      {a && a === b && <p className="text-sm text-muted">Elegí dos equipos distintos.</p>}
      {d && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-3xl font-extrabold">{d.winsA}</p><p className="truncate text-[11px] uppercase text-muted">{d.teamA.name}</p></div>
            <div><p className="text-3xl font-extrabold text-muted">{d.draws}</p><p className="text-[11px] uppercase text-muted">Empates</p></div>
            <div><p className="text-3xl font-extrabold">{d.winsB}</p><p className="truncate text-[11px] uppercase text-muted">{d.teamB.name}</p></div>
          </div>
          {tot > 0 && (
            <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="bg-accent" style={{ width: w(d.winsA) }} />
              <div className="bg-muted/50" style={{ width: w(d.draws) }} />
              <div className="bg-live" style={{ width: w(d.winsB) }} />
            </div>
          )}
          {d.matches.map((m) => (
            <Link key={m.id} to={'/partido/' + m.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="truncate text-muted">{m.tournament?.name ?? 'Amistoso'}{m.tournament?.year ? ' · ' + m.tournament.year : ''}</span>
              <span className="shrink-0 font-bold">{m.setsA} - {m.setsB}</span>
            </Link>
          ))}
          {d.played === 0 && <p className="text-sm text-muted">Todavía no jugaron entre sí.</p>}
        </>
      )}
    </Card>
  )
}

export default function EstadisticasPage() {
  const [tab, setTab] = useState('resumen')
  const [champ, setChamp] = useState(null)
  const [teams, setTeams] = useState([])
  const [team, setTeam] = useState('')
  const [q, setQ] = useState('')
  const [year, setYear] = useState('')
  const [mod, setMod] = useState('')
  const [branch, setBranch] = useState('')
  const filter = useMemo(() => {
    const p = new URLSearchParams()
    if (year) { p.set('yearFrom', year); p.set('yearTo', year) }
    if (mod) p.set('modality', mod)
    if (branch) p.set('branch', branch)
    const s = p.toString()
    return s ? '?' + s : ''
  }, [year, mod, branch])

  useEffect(() => { api('GET', '/teams').then((d) => setTeams([...d].sort((x, y) => x.name.localeCompare(y.name)))).catch(() => {}) }, [])
  useEffect(() => { setChamp(null); api('GET', '/stats/champions' + filter).then(setChamp).catch(() => setChamp(false)) }, [filter])

  const shown = teams.filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase()))
  const podium = (champ?.titles ?? []).slice(0, 3)

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Estadísticas</h1>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
        {TABS.map(([k, l]) => <Chip key={k} on={tab === k} onClick={() => setTab(k)}>{l}</Chip>)}
      </div>

      <div className="space-y-2">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
          <Chip on={!year} onClick={() => setYear('')}>Todos los años</Chip>
          {YEARS.map((y) => <Chip key={y} on={year === String(y)} onClick={() => setYear(String(y))}>{y}</Chip>)}
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
          <Chip on={!mod} onClick={() => setMod('')}>Toda modalidad</Chip>
          {Object.entries(MODALITY).map(([k, l]) => <Chip key={k} on={mod === k} onClick={() => setMod(k)}>{l}</Chip>)}
          <span className="mx-1 w-px shrink-0 bg-line" />
          <Chip on={!branch} onClick={() => setBranch('')}>Toda rama</Chip>
          {Object.entries(BRANCH).map(([k, l]) => <Chip key={k} on={branch === k} onClick={() => setBranch(k)}>{l}</Chip>)}
        </div>
      </div>

      {tab === 'resumen' && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Torneos" value={champ ? champ.tournaments.length : '…'} />
            <Stat label="Campeones" value={champ ? champ.titles.length : '…'} />
            <Stat label="Equipos" value={teams.length} />
          </div>
          <Card title="Más campeonatos">
            {champ === null && <p className="text-muted">Cargando…</p>}
            {champ === false && <p className="text-danger">No se pudo cargar.</p>}
            {champ && podium.length === 0 && <p className="text-sm text-muted">Todavía no hay torneos finalizados con estos filtros.</p>}
            {podium.map((x, i) => (
              <Link key={x.team.id} to={'/equipo/' + x.team.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
                <span className="w-5 text-center text-sm font-extrabold text-muted">{i + 1}</span>
                <TeamBadge team={x.team} size="sm" />
                <span className="min-w-0 flex-1 truncate font-bold">{x.team.name}</span>
                <span className="flex items-center gap-1 font-extrabold"><Trophy size={14} className="text-accent" /> {x.titles}</span>
              </Link>
            ))}
          </Card>
          {champ?.tournaments?.length > 0 && (
            <Card title="Últimos campeones">
              {champ.tournaments.slice(0, 4).map((t) => (
                <Link key={t.id} to={'/liga/' + t.id} className="flex items-center gap-3 text-sm">
                  <TeamBadge team={t.champion} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{t.champion.name}</p>
                    <p className="truncate text-xs text-muted">{t.name}{t.edition ? ' · ' + t.edition : ''} · {t.year}</p>
                  </div>
                  <Trophy size={16} className="text-accent" />
                </Link>
              ))}
            </Card>
          )}
        </>
      )}

      {tab === 'torneos' && (
        <Card title="Torneos finalizados">
          {champ === null && <p className="text-muted">Cargando…</p>}
          {champ?.tournaments?.length === 0 && <p className="text-sm text-muted">No hay torneos finalizados con estos filtros.</p>}
          {(champ?.tournaments ?? []).map((t) => (
            <Link key={t.id} to={'/liga/' + t.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{t.name}{t.edition ? ' · ' + t.edition : ''}</p>
                <p className="text-xs text-muted">{t.year} · {BRANCH[t.branch] ?? t.branch} · {MODALITY[t.modality] ?? t.modality}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <TeamBadge team={t.champion} size="sm" />
                <span className="max-w-[90px] truncate text-sm font-bold">{t.champion.name}</span>
              </div>
            </Link>
          ))}
        </Card>
      )}

      {tab === 'equipos' && (
        <>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input className={inputCls + ' pl-10'} placeholder="Buscar equipo" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {team && <TeamStats teamId={team} filter={filter} />}
          <div className="space-y-1.5">
            {shown.map((t) => (
              <button key={t.id} type="button" onClick={() => { setTeam(t.id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                className={'flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left ' + (team === t.id ? 'border-accent bg-accent-soft' : 'border-line bg-surface')}>
                <TeamBadge team={t} size="sm" />
                <span className="min-w-0 flex-1 truncate font-bold">{t.name}</span>
                <ChevronRight size={16} className="text-muted" />
              </button>
            ))}
            {shown.length === 0 && <p className="text-sm text-muted">Sin resultados.</p>}
          </div>
        </>
      )}

      {tab === 'cara' && <HeadToHead teams={teams} filter={filter} />}
    </div>
  )
}
