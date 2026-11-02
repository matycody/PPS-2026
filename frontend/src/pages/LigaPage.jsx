import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, ChevronRight, SlidersHorizontal, Users, CalendarDays } from 'lucide-react'
import { api } from '../lib/api'
import { BRANCH, MODALITY, FORMAT } from '../lib/format'
import TeamBadge from '../components/TeamBadge'
import FavHeart from '../components/FavHeart'

const Chip = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick} className={'shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ' + (on ? 'border-accent bg-accent text-black' : 'border-line bg-surface text-muted')}>{children}</button>
)

const title = (t) => t.name + (t.edition ? ' · ' + t.edition : '')
const tags = (t) => [BRANCH[t.branch], MODALITY[t.modality], FORMAT[t.format]].filter(Boolean)

// Torneo en curso: tarjeta grande con avance y partidos en vivo
function ActiveCard({ t }) {
  const p = t.progress ?? { played: 0, total: 0, live: 0 }
  const pct = p.total ? Math.round((p.played / p.total) * 100) : 0
  return (
    <div className={'rounded-3xl border bg-surface p-4 ' + (p.live ? 'border-live' : 'border-line')}>
      <div className="flex items-start gap-3">
        <Link to={'/liga/' + t.id} className="flex min-w-0 flex-1 items-center gap-3">
          <TeamBadge team={{ name: t.name, logo: t.logo }} size="lg" />
          <div className="min-w-0 flex-1">
            {p.live > 0 && <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-widest text-live"><span className="h-2 w-2 animate-pulse rounded-full bg-live" /> {p.live} {p.live === 1 ? 'partido en vivo' : 'partidos en vivo'}</p>}
            <p className="text-lg font-extrabold leading-tight">{title(t)}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tags(t).map((x) => <span key={x} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">{x}</span>)}
            </div>
          </div>
        </Link>
        <FavHeart type="TOURNAMENT" id={t.id} name={t.name} compact />
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>{p.total ? p.played + ' de ' + p.total + ' partidos' : 'Sin partidos cargados'}</span>
          {p.total > 0 && <span className="font-bold text-fg">{pct}%</span>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: pct + '%' }} /></div>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted"><Users size={14} /> {t._count?.teams ?? 0} equipos</span>
        <Link to={'/liga/' + t.id} className="flex items-center gap-1 font-bold text-accent">Ver torneo <ChevronRight size={16} /></Link>
      </div>
    </div>
  )
}

// Torneo terminado: fila compacta con el campeón
function FinishedRow({ t }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <Link to={'/liga/' + t.id} className="flex min-w-0 flex-1 items-center gap-3">
        <TeamBadge team={t.champion ?? { name: t.name, logo: t.logo }} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{title(t)}</p>
          <p className="truncate text-xs text-muted">{tags(t).join(' · ')}</p>
          {t.champion && <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-bold"><Trophy size={12} className="text-accent" /> {t.champion.name}</p>}
        </div>
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </Link>
      <FavHeart type="TOURNAMENT" id={t.id} name={t.name} compact />
    </div>
  )
}

// Listado público de competiciones: en curso arriba (con avance), finalizadas por año abajo
export default function LigaPage() {
  const [list, setList] = useState(null)
  const [tab, setTab] = useState('ACTIVE') // ACTIVE | FINISHED
  const [year, setYear] = useState('')
  const [mod, setMod] = useState('')
  const [branch, setBranch] = useState('')
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { api('GET', '/tournaments?limit=200').then(setList).catch((e) => setErr(e.message)) }, [])

  const all = useMemo(() => (list ?? []).filter((t) => t.status !== 'DRAFT'), [list])
  const years = useMemo(() => [...new Set(all.map((t) => t.year))].sort((a, b) => b - a), [all])
  const passes = (t) => (!year || String(t.year) === year) && (!mod || t.modality === mod) && (!branch || t.branch === branch)
  const active = all.filter((t) => t.status === 'ACTIVE' && passes(t))
  const finished = all.filter((t) => t.status === 'FINISHED' && passes(t))
  const shown = tab === 'ACTIVE' ? active : finished
  const groups = [...new Set(finished.map((t) => t.year))].sort((a, b) => b - a)
  const filtering = Boolean(year || mod || branch)
  const summary = [year || 'Todos los años', mod ? MODALITY[mod] : 'Todas las modalidades', branch ? BRANCH[branch] : 'Todas las ramas'].join(' · ')
  const totalLive = active.reduce((n, t) => n + (t.progress?.live ?? 0), 0)

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Competiciones</h1>

      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-surface p-1">
        {[['ACTIVE', 'En curso', active.length], ['FINISHED', 'Finalizadas', finished.length]].map(([k, label, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={'relative rounded-xl px-2 py-2.5 text-sm font-bold ' + (tab === k ? 'bg-accent text-black' : 'text-muted')}>
            {label} <span className="text-xs font-semibold opacity-80">({n})</span>
            {k === 'ACTIVE' && totalLive > 0 && <span className="absolute right-2 top-2 h-2 w-2 animate-pulse rounded-full bg-live" aria-label="Hay partidos en vivo" />}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setOpen((o) => !o)} className={'flex min-w-0 flex-1 items-center gap-2 rounded-full border bg-surface px-3.5 py-2 text-left text-sm ' + (filtering ? 'border-accent' : 'border-line')}>
            <SlidersHorizontal size={16} className="shrink-0 text-muted" />
            <span className="truncate">{summary}</span>
          </button>
          {filtering && <button type="button" onClick={() => { setYear(''); setMod(''); setBranch('') }} className="shrink-0 text-xs font-bold text-accent">Limpiar</button>}
        </div>
        {open && (
          <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
            {years.length > 1 && (
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-muted">Año</p>
                <div className="flex flex-wrap gap-1.5"><Chip on={!year} onClick={() => setYear('')}>Todos</Chip>{years.map((y) => <Chip key={y} on={year === String(y)} onClick={() => setYear(String(y))}>{y}</Chip>)}</div>
              </div>
            )}
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-muted">Modalidad</p>
              <div className="flex flex-wrap gap-1.5"><Chip on={!mod} onClick={() => setMod('')}>Todas</Chip>{Object.entries(MODALITY).map(([k, l]) => <Chip key={k} on={mod === k} onClick={() => setMod(k)}>{l}</Chip>)}</div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-muted">Rama</p>
              <div className="flex flex-wrap gap-1.5"><Chip on={!branch} onClick={() => setBranch('')}>Todas</Chip>{Object.entries(BRANCH).map(([k, l]) => <Chip key={k} on={branch === k} onClick={() => setBranch(k)}>{l}</Chip>)}</div>
            </div>
          </div>
        )}
      </div>

      {err && <p className="text-danger">{err}</p>}
      {list === null && !err && <p className="text-muted">Cargando…</p>}
      {list && shown.length === 0 && (
        <div className="rounded-3xl border border-line bg-surface p-6 text-center">
          <CalendarDays size={28} className="mx-auto text-muted" />
          <p className="mt-2 font-extrabold">{tab === 'ACTIVE' ? 'No hay competiciones en curso' : 'Todavía no hay competiciones finalizadas'}</p>
          <p className="mt-1 text-sm text-muted">{filtering ? 'Probá con otros filtros.' : tab === 'ACTIVE' ? 'Cuando arranque una, la vas a ver acá con su avance.' : 'Al cerrarse un torneo aparece acá con su campeón.'}</p>
        </div>
      )}

      {tab === 'ACTIVE' && <div className="space-y-3">{active.map((t) => <ActiveCard key={t.id} t={t} />)}</div>}

      {tab === 'FINISHED' && groups.map((y) => (
        <section key={y} className="space-y-2">
          <h2 className="text-sm font-extrabold">{y}</h2>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {finished.filter((t) => t.year === y).map((t) => <FinishedRow key={t.id} t={t} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
