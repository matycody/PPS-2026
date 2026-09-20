import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, X, Search } from 'lucide-react'
import { api } from '../../lib/api'
import { BRANCH } from '../../lib/format'
import { Btn, Alert, inputCls } from '../../components/ui'

export default function AdminTeamPage() {
  const { id } = useParams()
  const [team, setTeam] = useState(null)
  const [name, setName] = useState('')
  const [branches, setBranches] = useState([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [pick, setPick] = useState({}) // profileId -> rama elegida
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () =>
    api('GET', '/teams/' + id)
      .then((t) => { setTeam(t); setName(t.name); setBranches(t.branches ?? []) })
      .catch((e) => setErr(e.message))
  useEffect(() => { load() }, [id])

  async function run(fn, msg) {
    setBusy(true); setErr(''); setOk('')
    try { await fn(); if (msg) setOk(msg) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const toggle = (b) => setBranches((cur) => (cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]))

  const saveTeam = () =>
    run(async () => { await api('PATCH', '/teams/' + id, { name: name.trim(), branches }); await load() }, 'Equipo actualizado')

  const search = (e) => {
    e.preventDefault()
    run(async () => {
      const list = await api('GET', '/profiles?active=true&q=' + encodeURIComponent(q.trim()))
      setResults(list.filter((p) => p.isPlayer))
    })
  }

  const add = (p) => {
    const branch = pick[p.id] ?? team.branches?.[0]
    run(async () => {
      const r = await api('POST', '/teams/' + id + '/players', { profileId: p.id, branch })
      await load()
      setOk(r.transfer ? p.name + ' fue traspasado a este equipo' : p.name + ' agregado')
    })
  }

  const remove = (r) =>
    run(async () => {
      await api('DELETE', '/teams/' + id + '/players/' + r.profileId + '?branch=' + r.branch)
      await load()
    })

  if (!team) return <p className="mt-10 text-center text-muted">{err || 'Cargando…'}</p>

  return (
    <div className="space-y-4">
      <Link to="/admin/equipos" className="inline-flex items-center gap-1 text-sm font-semibold text-muted">
        <ChevronLeft size={16} /> Equipos
      </Link>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {ok && <Alert tone="ok" onClose={() => setOk('')}>{ok}</Alert>}

      <section className="space-y-3 rounded-3xl border border-line bg-surface p-5">
        <p className="text-sm font-bold">Datos del equipo</p>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {Object.entries(BRANCH).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              className={'rounded-full border px-4 py-2 text-sm font-bold ' + (branches.includes(k) ? 'border-accent bg-accent text-black' : 'border-line bg-surface-2')}
            >
              {label}
            </button>
          ))}
        </div>
        <Btn tone="accent" disabled={busy || !name.trim() || !branches.length} onClick={saveTeam} className="w-full">Guardar</Btn>
      </section>

      <section className="space-y-2 rounded-3xl border border-line bg-surface p-5">
        <p className="text-sm font-bold">Plantel</p>
        {(team.roster ?? []).length === 0 && <p className="text-sm text-muted">Sin jugadores.</p>}
        {(team.roster ?? []).map((r) => (
          <div key={r.profileId + r.branch} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
            <span className="flex-1 truncate font-semibold">{r.name}</span>
            <span className="text-muted">{BRANCH[r.branch] ?? r.branch}</span>
            <button aria-label="Quitar" disabled={busy} onClick={() => remove(r)}><X size={16} className="text-danger" /></button>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-3xl border border-line bg-surface p-5">
        <p className="text-sm font-bold">Agregar jugador</p>
        <form onSubmit={search} className="flex gap-2">
          <input className={inputCls} placeholder="Nombre, DNI o mail" value={q} onChange={(e) => setQ(e.target.value)} />
          <Btn type="submit" disabled={busy}><Search size={18} /></Btn>
        </form>
        {results?.length === 0 && <p className="text-sm text-muted">No se encontraron jugadores activos.</p>}
        {(results ?? []).map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.name}</p>
              <p className="text-xs text-muted">{p.dni} · {p.sex === 'M' ? 'Masc.' : 'Fem.'}</p>
            </div>
            <select
              className="rounded-lg border border-line bg-bg px-2 py-2 text-sm"
              value={pick[p.id] ?? team.branches?.[0]}
              onChange={(e) => setPick({ ...pick, [p.id]: e.target.value })}
            >
              {(team.branches ?? []).map((b) => <option key={b} value={b}>{BRANCH[b]}</option>)}
            </select>
            <Btn tone="accent" disabled={busy} onClick={() => add(p)} className="px-3 py-2">Agregar</Btn>
          </div>
        ))}
      </section>
    </div>
  )
}
