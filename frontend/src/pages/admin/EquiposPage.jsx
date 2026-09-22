import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, ChevronRight } from 'lucide-react'
import { api, apiUpload } from '../../lib/api'
import { BRANCH } from '../../lib/format'
import { Btn, Alert, inputCls } from '../../components/ui'
import TeamBadge from '../../components/TeamBadge'
import LogoPicker from '../../components/LogoPicker'

export default function EquiposPage() {
  const [list, setList] = useState(null)
  const [name, setName] = useState('')
  const [branches, setBranches] = useState(['MIXED'])
  const [logo, setLogo] = useState(null) // { file, url }
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api('GET', '/teams').then(setList).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  const toggle = (b) => setBranches((cur) => (cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]))

  const pickLogo = (file) =>
    setLogo((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return { file, url: URL.createObjectURL(file) }
    })
  const clearLogo = () =>
    setLogo((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })

  async function create(e) {
    e.preventDefault()
    if (!branches.length) return setErr('Elegí al menos una rama')
    setBusy(true); setErr(''); setOk('')
    try {
      const team = await api('POST', '/teams', { name: name.trim(), branches })
      let msg = 'Equipo creado'
      if (logo) {
        try {
          await apiUpload('/photos/teams/' + team.id, logo.file)
        } catch (e2) {
          msg = 'Equipo creado, pero el escudo no se pudo subir (' + e2.message + '). Subilo desde el equipo.'
        }
      }
      setName('')
      clearLogo()
      setOk(msg)
      await load()
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  async function remove(t) {
    if (!confirm('¿Eliminar "' + t.name + '"?')) return
    setErr('')
    try { await api('DELETE', '/teams/' + t.id); await load() } catch (e) { setErr(e.message) }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Equipos</h1>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {ok && <Alert tone="ok" onClose={() => setOk('')}>{ok}</Alert>}

      <form onSubmit={create} className="space-y-3 rounded-3xl border border-line bg-surface p-5">
        <p className="text-sm font-bold">Nuevo equipo</p>
        <input className={inputCls} placeholder="Nombre" required value={name} onChange={(e) => setName(e.target.value)} />
        <LogoPicker name={name} src={logo?.url} onPick={pickLogo} onClear={clearLogo} onError={setErr} disabled={busy} label="Escudo (opcional)" />
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
        <Btn type="submit" tone="accent" disabled={busy} className="w-full">Crear equipo</Btn>
      </form>

      {list === null && <p className="text-muted">Cargando…</p>}
      {list?.length === 0 && <p className="text-muted">Todavía no hay equipos.</p>}
      <div className="space-y-2">
        {(list ?? []).map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <TeamBadge team={t} />
            <Link to={'/admin/equipos/' + t.id} className="flex min-w-0 flex-1 items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{t.name}</p>
                <p className="text-xs text-muted">{(t.branches ?? []).map((b) => BRANCH[b] ?? b).join(' · ')}</p>
              </div>
              <ChevronRight size={18} className="text-muted" />
            </Link>
            <button aria-label="Eliminar" onClick={() => remove(t)}><Trash2 size={18} className="text-danger" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
