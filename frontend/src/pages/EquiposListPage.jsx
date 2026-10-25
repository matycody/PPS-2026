import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { api } from '../lib/api'
import { BRANCH, MODALITY } from '../lib/format'
import TeamBadge from '../components/TeamBadge'

const norm = (s) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

// Listado público de equipos: cada uno abre su banner
export default function EquiposListPage() {
  const [teams, setTeams] = useState(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => { api('GET', '/teams').then(setTeams).catch((e) => setErr(e.message)) }, [])
  const list = useMemo(() => (teams ?? []).filter((t) => norm(t.name).includes(norm(q.trim()))), [teams, q])

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Equipos{teams ? ' · ' + list.length : ''}</h2>
      <label className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3">
        <Search size={18} className="text-muted" />
        <input className="w-full bg-transparent outline-none" placeholder="Buscar equipo" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {err && <p className="text-danger">{err}</p>}
      {teams === null && !err && <p className="text-muted">Cargando…</p>}
      {teams && list.length === 0 && <p className="text-muted">No hay equipos que coincidan.</p>}
      {list.map((t) => (
        <Link key={t.id} to={'/equipo/' + t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
          <TeamBadge team={t} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{t.name}</p>
            <p className="truncate text-xs text-muted">
              {[...(t.branches ?? []).map((b) => BRANCH[b] ?? b), ...(t.modalities ?? []).map((m) => MODALITY[m] ?? m)].join(' · ')}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}
