import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, Search, ChevronRight, Swords, Flame, Zap, ShieldCheck, Clock, SlidersHorizontal, Medal, Flag } from 'lucide-react'
import { api } from '../lib/api'
import { BRANCH, MODALITY } from '../lib/format'
import { inputCls } from '../components/ui'
import Podium from '../components/Podium'
import TeamBadge from '../components/TeamBadge'

const TABS = [['resumen', 'Resumen'], ['estadisticas', 'Estadísticas'], ['fama', 'Salón de la fama'], ['torneos', 'Torneos'], ['equipos', 'Equipos'], ['cara', 'Cara a cara']]
const YEAR = new Date().getFullYear()
const YEARS = [YEAR, YEAR - 1, YEAR - 2]

const Chip = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick} className={'shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ' + (on ? 'border-accent bg-accent text-black' : 'border-line bg-surface text-muted')}>{children}</button>
)

const Card = ({ title, action, children, className = '' }) => (
  <section className={'rounded-3xl border border-line bg-surface p-4 ' + className}>
    {title && (
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">{title}</p>
        {action}
      </div>
    )}
    {children}
  </section>
)

function Metric({ value, label }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-3 py-2.5">
      <p className="text-2xl font-extrabold leading-tight">{value ?? '…'}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

function Record({ Icon, value, label }) {
  const body = (
    <>
      <Icon size={18} className="text-accent" />
      <p className="mt-1 text-lg font-extrabold leading-tight">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </>
  )
  return <div className="rounded-2xl bg-surface-2 px-3 py-2.5">{body}</div>
}

const RESULT_CLS = { CHAMPION: 'bg-accent text-black', RUNNER_UP: 'bg-surface-2 text-fg', THIRD: 'bg-surface-2 text-fg' }
const RESULT_ICON = { CHAMPION: Trophy, RUNNER_UP: Medal, THIRD: Medal }
const FORM = { W: ['G', 'bg-accent text-black'], D: ['E', 'bg-warn text-black'], L: ['P', 'bg-danger text-black'] }

function Ring({ pct }) {
  const r = 38
  const c = 2 * Math.PI * r
  return (
    <svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label={'Efectividad ' + pct + '%'} className="shrink-0">
      <circle cx="46" cy="46" r={r} fill="none" stroke="currentColor" strokeWidth="9" className="text-surface-2" />
      <circle cx="46" cy="46" r={r} fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" className="text-accent" strokeDasharray={(c * pct) / 100 + ' ' + c} transform="rotate(-90 46 46)" />
      <text x="46" y="50" textAnchor="middle" fontSize="20" fontWeight="800" fill="currentColor">{pct}%</text>
      <text x="46" y="64" textAnchor="middle" fontSize="9" fill="currentColor" className="text-muted">efectividad</text>
    </svg>
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
  const pct = r.played ? Math.round((r.won / r.played) * 100) : 0
  const w = (n) => (r.played ? (n / r.played) * 100 : 0) + '%'
  return (
    <div className="space-y-3">
      <Link to={'/equipo/' + d.team.id} className="flex items-center gap-3 rounded-3xl border border-line bg-surface p-4">
        <TeamBadge team={d.team} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-extrabold">{d.team.name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted">
            <span className="flex items-center gap-1"><Trophy size={14} className="text-accent" /> {d.titles} {d.titles === 1 ? 'título' : 'títulos'}</span>
            <span>{d.tournamentsPlayed} {d.tournamentsPlayed === 1 ? 'torneo' : 'torneos'}</span>
          </p>
        </div>
        <ChevronRight size={18} className="text-muted" />
      </Link>

      <Card>
        <div className="flex items-center gap-4">
          <Ring pct={pct} />
          <div className="min-w-0 flex-1">
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div className="bg-accent" style={{ width: w(r.won) }} />
              <div className="bg-warn" style={{ width: w(r.drawn) }} />
              <div className="bg-danger" style={{ width: w(r.lost) }} />
            </div>
            <p className="mt-2 text-xs text-muted">{r.won} G · {r.drawn} E · {r.lost} P de {r.played} jugados</p>
            <p className="mt-1 text-xs text-muted">Sets <b className="text-fg">{r.setsFor} a favor</b> · {r.setsAgainst} en contra</p>
          </div>
        </div>
      </Card>

      {(d.form ?? []).length > 0 && (
        <Card title="Forma reciente">
          <div className="flex gap-1.5">
            {d.form.map((f, i) => <span key={i} className={'grid h-7 w-7 place-items-center rounded-lg text-xs font-extrabold ' + FORM[f][1]}>{FORM[f][0]}</span>)}
          </div>
        </Card>
      )}

      {(d.career ?? []).length > 0 && (
        <Card title="Recorrido por torneo">
          <div className="space-y-1.5">
            {d.career.map((c) => {
              const Icon = RESULT_ICON[c.result?.kind] ?? Flag
              return (
                <Link key={c.tournamentId} to={'/liga/' + c.tournamentId} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
                  <Icon size={18} className={c.result?.kind === 'CHAMPION' ? 'text-accent' : 'text-muted'} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{c.tournament}{c.edition ? ' · ' + c.edition : ''}</p>
                    <p className="text-xs text-muted">{c.year}</p>
                  </div>
                  <span className={'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ' + (RESULT_CLS[c.result?.kind] ?? 'bg-surface-2 text-muted')}>{c.result?.label ?? '—'}</span>
                </Link>
              )
            })}
          </div>
        </Card>
      )}
    </div>
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

function Resumen({ champ, rec, teamsCount }) {
  const last = champ?.tournaments?.[0]
  const t = rec?.totals
  const r = rec?.records
  return (
    <div className="space-y-3">
      {last && (
        <Link to={'/liga/' + last.id} className="flex items-center gap-3 rounded-3xl border border-accent bg-surface p-4">
          <TeamBadge team={last.champion} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-accent">Último campeón</p>
            <p className="truncate text-xl font-extrabold">{last.champion.name}</p>
            <p className="truncate text-xs text-muted">{last.name}{last.edition ? ' · ' + last.edition : ''} · {last.year}</p>
          </div>
          <Trophy size={28} className="shrink-0 text-accent" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Metric value={t?.matches} label="Partidos jugados" />
        <Metric value={t?.sets} label="Sets disputados" />
        <Metric value={t?.tournaments ?? (champ ? champ.tournaments.length : undefined)} label="Torneos cerrados" />
        <Metric value={t?.teams ?? teamsCount} label="Equipos" />
      </div>

      <Card title="Ranking histórico">
        {rec === null && <p className="text-muted">Cargando…</p>}
        {rec === false && <p className="text-sm text-danger">No se pudo cargar.</p>}
        {rec && rec.ranking.length === 0 && <p className="text-sm text-muted">Todavía no hay partidos terminados con estos filtros.</p>}
        <div className="space-y-1">
          {(rec?.ranking ?? []).slice(0, 5).map((x, i) => (
            <Link key={x.team.id} to={'/equipo/' + x.team.id} className="flex items-center gap-3 rounded-2xl px-1 py-2">
              <span className="w-4 text-center text-sm font-extrabold text-muted">{i + 1}</span>
              <TeamBadge team={x.team} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{x.team.name}</p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-accent" style={{ width: x.pct + '%' }} /></div>
              </div>
              <div className="shrink-0 text-right">
                <p className="flex items-center justify-end gap-1 text-sm font-extrabold"><Trophy size={13} className="text-accent" /> {x.titles}</p>
                <p className="text-[11px] text-muted">{x.pct}% efect.</p>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      {r && (r.streak || r.blowout || r.unbeaten || r.longest) && (
        <Card title="Récords">
          <div className="grid grid-cols-2 gap-2">
            {r.streak && <Record Icon={Flame} value={r.streak.n + (r.streak.n === 1 ? ' victoria' : ' seguidas')} label={'Mayor racha · ' + r.streak.team.name} />}
            {r.blowout && <Record Icon={Zap} value={r.blowout.score[0] + ' a ' + r.blowout.score[1]} label={'Mayor paliza en sets · ' + r.blowout.winner.name} />}
            {r.unbeaten && <Record Icon={ShieldCheck} value="Invicto" label={r.unbeaten.team.name + ' · ' + r.unbeaten.played + ' partidos'} />}
            {r.longest && <Record Icon={Clock} value={r.longest.sets + ' sets'} label={'Partido más largo · ' + r.longest.teamA.name + ' vs ' + r.longest.teamB.name} />}
          </div>
        </Card>
      )}

      {champ?.tournaments?.length > 0 && (
        <Card title="Campeones por torneo" action={<span className="text-xs text-muted">{champ.tournaments.length}</span>}>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {champ.tournaments.slice(0, 8).map((x) => (
              <Link key={x.id} to={'/liga/' + x.id} className="w-36 shrink-0 rounded-2xl bg-surface-2 p-3">
                <p className="truncate text-xs text-muted">{x.year} · {MODALITY[x.modality] ?? x.modality}</p>
                <p className="truncate text-xs text-muted">{BRANCH[x.branch] ?? x.branch}</p>
                <div className="mt-2 flex items-center gap-2"><TeamBadge team={x.champion} size="sm" /><span className="truncate text-sm font-extrabold">{x.champion.name}</span></div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// Tabla general de equipos con los filtros activos (los datos por jugador llegan cuando se carguen quemadas y catches)
function TablaEquipos({ rec }) {
  const rows = rec?.ranking ?? []
  return (
    <div className="space-y-3">
      <Card title="Tabla de equipos">
        {rec === null && <p className="text-muted">Cargando…</p>}
        {rec === false && <p className="text-sm text-danger">No se pudo cargar.</p>}
        {rec && rows.length === 0 && <p className="text-sm text-muted">Todavía no hay partidos terminados con estos filtros.</p>}
        {rows.length > 0 && (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-1 pb-2 font-bold">#</th>
                  <th className="px-1 pb-2 font-bold">Equipo</th>
                  <th className="px-1 pb-2 text-center font-bold">PJ</th>
                  <th className="px-1 pb-2 text-center font-bold">G</th>
                  <th className="px-1 pb-2 text-center font-bold">E</th>
                  <th className="px-1 pb-2 text-center font-bold">P</th>
                  <th className="px-1 pb-2 text-right font-bold">Efect.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x, i) => (
                  <tr key={x.team.id} className="border-t border-line">
                    <td className="px-1 py-2 font-extrabold text-muted">{i + 1}</td>
                    <td className="px-1 py-2">
                      <Link to={'/equipo/' + x.team.id} className="flex items-center gap-2"><TeamBadge team={x.team} size="sm" /><span className="truncate font-bold">{x.team.name}</span></Link>
                    </td>
                    <td className="px-1 py-2 text-center">{x.played}</td>
                    <td className="px-1 py-2 text-center">{x.won}</td>
                    <td className="px-1 py-2 text-center">{x.drawn}</td>
                    <td className="px-1 py-2 text-center">{x.lost}</td>
                    <td className="px-1 py-2 text-right font-extrabold">{x.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Por jugador">
        <p className="text-sm text-muted">Quemadas, catches y presencias por jugador: próximamente. Se arman con lo que la mesa registre en cada partido.</p>
      </Card>
    </div>
  )
}

// Salón de la fama: quién ganó qué, con los títulos de cada equipo
function SalonFama({ champ }) {
  const titles = champ?.titles ?? []
  const wins = (id) => (champ?.tournaments ?? []).filter((t) => t.champion?.id === id)
  const top = titles[0]
  return (
    <div className="space-y-3">
      {champ === null && <p className="text-muted">Cargando…</p>}
      {champ === false && <p className="text-sm text-danger">No se pudo cargar.</p>}
      {champ && titles.length === 0 && <Card><p className="text-sm text-muted">Todavía no hay campeones con estos filtros. El primero que cierre un torneo entra acá.</p></Card>}
      {top && (
        <Link to={'/equipo/' + top.team.id} className="flex items-center gap-3 rounded-3xl border border-accent bg-surface p-4">
          <TeamBadge team={top.team} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-accent">Más campeonatos</p>
            <p className="truncate text-xl font-extrabold">{top.team.name}</p>
            <p className="text-xs text-muted">{top.titles} {top.titles === 1 ? 'título' : 'títulos'}</p>
          </div>
          <Trophy size={28} className="shrink-0 text-accent" />
        </Link>
      )}
      {(champ?.tournaments ?? []).filter((t) => t.podium?.first).length > 0 && <h2 className="px-1 pt-2 text-xs font-bold uppercase tracking-widest text-muted">Podios por torneo</h2>}
      {(champ?.tournaments ?? []).filter((t) => t.podium?.first).map((t) => (
        <div key={t.id}>
          <Link to={'/liga/' + t.id} className="mb-1.5 block truncate px-1 text-xs font-bold">{t.year} · {t.name}{t.edition ? ' · ' + t.edition : ''}</Link>
          <Podium podium={t.podium} />
        </div>
      ))}
      <h2 className="px-1 pt-2 text-xs font-bold uppercase tracking-widest text-muted">Títulos por equipo</h2>
      {titles.map((x) => (
        <Card key={x.team.id}>
          <Link to={'/equipo/' + x.team.id} className="flex items-center gap-3">
            <TeamBadge team={x.team} size="md" />
            <span className="min-w-0 flex-1 truncate font-extrabold">{x.team.name}</span>
            <span className="flex items-center gap-1 font-extrabold"><Trophy size={14} className="text-accent" /> {x.titles}</span>
          </Link>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {wins(x.team.id).map((t) => (
              <Link key={t.id} to={'/liga/' + t.id} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold">{t.year} · {t.name}{t.edition ? ' · ' + t.edition : ''}</Link>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}

export default function EstadisticasPage() {
  const [tab, setTab] = useState('resumen')
  const [champ, setChamp] = useState(null)
  const [rec, setRec] = useState(null)
  const [teams, setTeams] = useState([])
  const [team, setTeam] = useState('')
  const [q, setQ] = useState('')
  const [year, setYear] = useState('')
  const [mod, setMod] = useState('')
  const [branch, setBranch] = useState('')
  const [open, setOpen] = useState(false)
  const filter = useMemo(() => {
    const p = new URLSearchParams()
    if (year) { p.set('yearFrom', year); p.set('yearTo', year) }
    if (mod) p.set('modality', mod)
    if (branch) p.set('branch', branch)
    const s = p.toString()
    return s ? '?' + s : ''
  }, [year, mod, branch])
  const active = Boolean(year || mod || branch)
  const summary = [year || 'Todos los años', mod ? MODALITY[mod] : 'Todas las modalidades', branch ? BRANCH[branch] : 'Todas las ramas'].join(' · ')

  useEffect(() => { api('GET', '/teams').then((d) => setTeams([...d].sort((x, y) => x.name.localeCompare(y.name)))).catch(() => {}) }, [])
  useEffect(() => { setChamp(null); api('GET', '/stats/champions' + filter).then(setChamp).catch(() => setChamp(false)) }, [filter])
  useEffect(() => { setRec(null); api('GET', '/stats/records' + filter).then(setRec).catch(() => setRec(false)) }, [filter])

  const shown = teams.filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase()))
  const clear = () => { setYear(''); setMod(''); setBranch('') }

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Ranking</h1>

      <div className="flex gap-5 overflow-x-auto rounded-2xl border border-line bg-surface px-4">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={'shrink-0 border-b-2 py-2.5 text-sm ' + (tab === k ? 'border-accent font-extrabold' : 'border-transparent text-muted [text-shadow:none]')}>{l}</button>
        ))}
      </div>

      {(
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setOpen((o) => !o)} className={'flex min-w-0 flex-1 items-center gap-2 rounded-full border bg-surface px-3.5 py-2 text-left text-sm ' + (active ? 'border-accent' : 'border-line')}>
              <SlidersHorizontal size={16} className="shrink-0 text-muted" />
              <span className="truncate">{summary}</span>
            </button>
            {active && <button type="button" onClick={clear} className="shrink-0 text-xs font-bold text-accent">Limpiar</button>}
          </div>
          {open && (
            <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-muted">Año</p>
                <div className="flex flex-wrap gap-1.5">
                  <Chip on={!year} onClick={() => setYear('')}>Todos</Chip>
                  {YEARS.map((y) => <Chip key={y} on={year === String(y)} onClick={() => setYear(String(y))}>{y}</Chip>)}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-muted">Modalidad</p>
                <div className="flex flex-wrap gap-1.5">
                  <Chip on={!mod} onClick={() => setMod('')}>Todas</Chip>
                  {Object.entries(MODALITY).map(([k, l]) => <Chip key={k} on={mod === k} onClick={() => setMod(k)}>{l}</Chip>)}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-muted">Rama</p>
                <div className="flex flex-wrap gap-1.5">
                  <Chip on={!branch} onClick={() => setBranch('')}>Todas</Chip>
                  {Object.entries(BRANCH).map(([k, l]) => <Chip key={k} on={branch === k} onClick={() => setBranch(k)}>{l}</Chip>)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'resumen' && <Resumen champ={champ || undefined} rec={rec} teamsCount={teams.length} />}

      {tab === 'estadisticas' && <TablaEquipos rec={rec} />}
      {tab === 'fama' && <SalonFama champ={champ} />}

      {tab === 'torneos' && (
        <Card title="Torneos finalizados">
          {champ === null && <p className="text-muted">Cargando…</p>}
          {champ?.tournaments?.length === 0 && <p className="text-sm text-muted">No hay torneos finalizados con estos filtros.</p>}
          <div className="space-y-2">
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
          </div>
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

      {tab === 'cara' && (
        <>
          <HeadToHead teams={teams} filter={filter} />
        </>
      )}
    </div>
  )
}
