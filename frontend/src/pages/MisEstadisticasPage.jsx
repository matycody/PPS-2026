import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, Flame, ShieldAlert, CalendarClock } from 'lucide-react'
import { api } from '../lib/api'
import TeamBadge from '../components/TeamBadge'
import Forma from '../components/torneo/Forma'
import { MedalPodium } from '../components/Podium'
import { BRANCH } from '../lib/format'

const RES = { G: 'V', E: 'E', P: 'D' }
const RES_CLS = { G: 'bg-live/15 text-live', P: 'bg-danger/15 text-danger', E: 'bg-surface-2 text-muted' }
const KIND = { CHAMPION: 'text-warn', RUNNER_UP: 'text-fg', THIRD: 'text-accent' }
const SANC = [['warning', 'Advertencias', 'bg-surface-2 text-fg'], ['yellow', 'Amarillas', 'bg-warn text-black'], ['blue', 'Azules', 'bg-accent text-black'], ['red', 'Rojas', 'bg-danger text-white']]
const SANC_NAME = { WARNING: 'Advertencia', YELLOW: 'Amarilla', BLUE: 'Azul', RED: 'Roja' }
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'Sin programación')

const Card = ({ title, icon, children }) => (
  <section className="space-y-3 rounded-3xl border border-line bg-surface p-4">
    <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">{icon}{title}</h2>
    {children}
  </section>
)

// Estadísticas del jugador: salen de los partidos de sus equipos actuales (por rama) y de sus sanciones
export default function MisEstadisticasPage() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api('GET', '/me/stats').then(setD).catch((e) => setErr(e.message)) }, [])

  if (err) return <p className="text-danger">{err}</p>
  if (!d) return <p className="text-muted">Cargando…</p>
  if (!d.teams.length) return <p className="rounded-2xl border border-line bg-surface p-4 text-sm">Todavía no estás vinculado a un equipo. Cuando la organización te asigne uno, vas a ver tus estadísticas acá.</p>

  const t = d.total
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Mis estadísticas</h1>

      <section className="rounded-3xl border border-accent bg-surface p-4">
        <div className="flex flex-wrap gap-2">
          {d.teams.map((x) => (
            <Link key={x.id + x.branch} to={'/equipo/' + x.id} className="flex items-center gap-2 rounded-full bg-surface-2 py-1 pl-1 pr-3">
              <TeamBadge team={x} size="sm" />
              <span className="text-sm font-bold">{x.name}</span>
              <span className="text-[10px] font-bold uppercase text-muted">{BRANCH[x.branch] ?? x.branch}</span>
            </Link>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[['Jugados', t.played], ['Ganados', t.won], ['Empates', t.drawn], ['Perdidos', t.lost]].map(([l, v]) => (
            <div key={l}><p className="text-2xl font-extrabold">{v}</p><p className="text-[10px] font-bold uppercase text-muted">{l}</p></div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex justify-between text-xs font-bold"><span className="text-muted">Victorias</span><span>{t.pct}%</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-live" style={{ width: t.pct + '%' }} /></div>
          </div>
          <div className="shrink-0 text-right">
            <p className="mb-1 text-[10px] font-bold uppercase text-muted">Racha</p>
            <Forma form={[...d.form].reverse().map((r) => RES[r])} />
          </div>
        </div>
      </section>

      {d.next && (
        <Card title="Próximo partido" icon={<CalendarClock size={14} />}>
          <Link to={'/partido/' + d.next.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <TeamBadge team={d.next.rival ?? { name: '?' }} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">vs {d.next.rival?.name ?? 'Por definir'}</p>
              <p className="truncate text-xs text-muted">{d.next.tournament ?? 'Amistoso'} · {day(d.next.scheduledAt)}</p>
            </div>
            {d.next.status === 'LIVE' && <span className="rounded-full bg-live/15 px-2 py-0.5 text-[10px] font-bold uppercase text-live">En vivo</span>}
          </Link>
        </Card>
      )}

      {(d.medals.gold || d.medals.silver || d.medals.bronze) > 0 && (
        <Card title="Mis podios" icon={<Trophy size={14} />}>
          <MedalPodium {...d.medals} className="mx-auto max-w-xs" />
        </Card>
      )}

      {d.career.length > 0 && (
        <Card title="Mis torneos" icon={<Flame size={14} />}>
          <div className="divide-y divide-line">
            {d.career.map((c) => (
              <Link key={c.tournamentId + c.teamId} to={'/liga/' + c.tournamentId} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{c.tournament}{c.edition ? ' · ' + c.edition : ''}</p>
                  <p className="truncate text-xs text-muted">{c.teamName} · {c.year}</p>
                </div>
                <span className={'shrink-0 text-sm font-extrabold ' + (KIND[c.result.kind] ?? 'text-muted')}>{c.result.label}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {d.recent.length > 0 && (
        <Card title="Últimos partidos">
          <div className="space-y-2">
            {d.recent.map((m) => (
              <Link key={m.id} to={'/partido/' + m.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
                <span className={'grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ' + RES_CLS[m.res]}>{RES[m.res]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">vs {m.rival?.name ?? 'Por definir'}</p>
                  <p className="truncate text-xs text-muted">{m.tournament ?? 'Amistoso'} · {day(m.date)}</p>
                </div>
                <span className="font-mono text-lg font-extrabold tabular-nums">{m.mine} - {m.other}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card title="Sanciones" icon={<ShieldAlert size={14} />}>
        {d.sanctions?.total ? (
          <>
            <div className="grid grid-cols-4 gap-2 text-center">
              {SANC.map(([k, label, cls]) => (
                <div key={k}><span className={'mx-auto grid h-9 w-9 place-items-center rounded-lg text-lg font-extrabold ' + cls}>{d.sanctions[k]}</span><p className="mt-1 text-[10px] font-bold uppercase text-muted">{label}</p></div>
              ))}
            </div>
            <div className="divide-y divide-line">
              {d.sanctions.recent.map((s) => (
                <Link key={s.id} to={'/partido/' + s.matchId} className="block py-2 text-sm">
                  <span className="font-bold">{SANC_NAME[s.kind]}</span> <span className="text-muted">· {s.vs} · {day(s.date)}</span>
                  {s.reason && <p className="truncate text-xs text-muted">{s.reason}</p>}
                </Link>
              ))}
            </div>
          </>
        ) : <p className="text-sm text-muted">Sin sanciones. Jugás limpio. 👏</p>}
      </Card>

      <Card title="Quemadas y catches">
        <p className="text-sm text-muted">Próximamente: cuando la mesa registre las jugadas por jugador, vas a ver tus quemadas, catches y eficacia.</p>
      </Card>
    </div>
  )
}
