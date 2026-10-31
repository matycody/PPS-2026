import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Plus, Pencil, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { Btn, Alert, Skeleton, inputCls } from '../components/ui'
import { useAuthStore } from '../stores/authStore'
import { useFavorites } from '../stores/favoritesStore'
import { useConfirm } from '../components/ConfirmProvider'

const ago = (iso) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'ahora'
  if (min < 60) return 'hace ' + min + ' min'
  const h = Math.round(min / 60)
  if (h < 24) return 'hace ' + h + ' h'
  const d = Math.round(h / 24)
  if (d < 7) return 'hace ' + d + (d === 1 ? ' día' : ' días')
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

const isAdminUser = (u) => !!u?.roles?.includes('ADMIN')

// Tarjeta del listado: portada arriba, título, quién la escribió y hace cuánto
function NewsCard({ n }) {
  return (
    <Link to={'/noticias/' + n.id} className="block overflow-hidden rounded-2xl border border-line bg-surface">
      {n.imageUrl && <img src={n.imageUrl} alt="" loading="lazy" className="h-44 w-full object-cover" />}
      <div className="space-y-1.5 p-4">
        <p className="text-base font-extrabold leading-snug">{n.title}</p>
        {n.summary && <p className="line-clamp-2 text-sm text-muted">{n.summary}</p>}
        <p className="flex flex-wrap items-center gap-x-2 text-[11px] font-bold uppercase tracking-wide text-muted">
          {n.team && <span className="text-accent">{n.team.name}</span>}
          <span>{n.authorName}</span>
          <span>· {ago(n.publishedAt)}</span>
        </p>
      </div>
    </Link>
  )
}

function Editor({ initial, teams, onSaved, onCancel }) {
  const [f, setF] = useState({
    title: initial?.title ?? '', summary: initial?.summary ?? '', body: initial?.body ?? '',
    imageUrl: initial?.imageUrl ?? '', teamId: initial?.teamId ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const save = async () => {
    setBusy(true); setErr('')
    try {
      const body = { ...f, teamId: f.teamId || null }
      const row = initial ? await api('PATCH', '/news/' + initial.id, body) : await api('POST', '/news', body)
      onSaved(row)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <p className="text-sm font-bold">{initial ? 'Editar noticia' : 'Nueva noticia'}</p>
      <input className={inputCls} placeholder="Título" maxLength={140} value={f.title} onChange={(e) => set('title', e.target.value)} />
      <input className={inputCls} placeholder="Bajada corta (opcional)" maxLength={280} value={f.summary} onChange={(e) => set('summary', e.target.value)} />
      <textarea className={inputCls + ' min-h-[10rem]'} placeholder="Escribí la noticia. Dejá una línea en blanco entre párrafos." value={f.body} onChange={(e) => set('body', e.target.value)} />
      <input className={inputCls} placeholder="Enlace de la imagen de portada (opcional, https)" value={f.imageUrl} onChange={(e) => set('imageUrl', e.target.value)} />
      <select className={inputCls} value={f.teamId} onChange={(e) => set('teamId', e.target.value)}>
        <option value="">Noticia general de la liga</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      <div className="flex gap-2">
        <Btn className="flex-1" onClick={onCancel} disabled={busy}>Cancelar</Btn>
        <Btn tone="accent" className="flex-1" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Publicar'}</Btn>
      </div>
    </div>
  )
}

export function NoticiaDetalle() {
  const { id } = useParams()
  const nav = useNavigate()
  const ask = useConfirm()
  const user = useAuthStore((s) => s.user)
  const [n, setN] = useState(null)
  const [teams, setTeams] = useState([])
  const [edit, setEdit] = useState(false)
  const [err, setErr] = useState('')
  const admin = isAdminUser(user)
  useEffect(() => { api('GET', '/news/' + id).then(setN).catch((e) => { setN(false); setErr(e.message) }) }, [id])
  useEffect(() => { if (admin) api('GET', '/teams').then(setTeams).catch(() => {}) }, [admin])
  const remove = async () => {
    if (!(await ask({ title: 'Eliminar noticia', message: 'Se borra para todos. ¿Seguro?', confirmText: 'Eliminar' }))) return
    try { await api('DELETE', '/news/' + id); nav('/noticias') } catch (e) { setErr(e.message) }
  }
  if (n === null) return <Skeleton rows={4} />
  if (n === false) return <div className="space-y-3"><Link to="/noticias" className="text-sm text-accent">← Noticias</Link><p className="text-danger">{err || 'No se encontró la noticia.'}</p></div>
  if (edit) return <Editor initial={n} teams={teams} onCancel={() => setEdit(false)} onSaved={(row) => { setN(row); setEdit(false) }} />
  return (
    <article className="space-y-4">
      <Link to="/noticias" className="inline-flex items-center gap-1 text-sm font-bold text-accent"><ChevronLeft size={16} /> Noticias</Link>
      {n.imageUrl && <img src={n.imageUrl} alt="" className="max-h-72 w-full rounded-2xl object-cover" />}
      <h1 className="text-2xl font-extrabold leading-tight">{n.title}</h1>
      <p className="flex flex-wrap items-center gap-x-2 text-[11px] font-bold uppercase tracking-wide text-muted">
        {n.team && <Link to={'/equipo/' + n.team.id} className="text-accent">{n.team.name}</Link>}
        <span>Por {n.authorName}</span>
        <span>· {new Date(n.publishedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
      </p>
      {n.summary && <p className="text-base font-semibold text-muted">{n.summary}</p>}
      <div className="space-y-3 text-[15px] leading-relaxed">
        {n.body.split(/\n{2,}/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
      </div>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {admin && (
        <div className="grid grid-cols-2 gap-2">
          <Btn onClick={() => setEdit(true)}><Pencil size={14} /> Editar</Btn>
          <Btn tone="danger" onClick={remove}><Trash2 size={14} /> Eliminar</Btn>
        </div>
      )}
    </article>
  )
}

export default function NoticiasPage() {
  const user = useAuthStore((s) => s.user)
  const favTeams = useFavorites((s) => s.teams)
  const favLoaded = useFavorites((s) => s.loaded)
  const loadFavs = useFavorites((s) => s.load)
  const [list, setList] = useState(null)
  const [tab, setTab] = useState('all') // all | mine
  const [teams, setTeams] = useState([])
  const [writing, setWriting] = useState(false)
  const [err, setErr] = useState('')
  const [more, setMore] = useState(true)
  const admin = isAdminUser(user)
  const teamIds = [...favTeams].join(',')

  const load = useCallback(() => {
    if (tab === 'mine' && !teamIds) { setList([]); setMore(false); return }
    setList(null)
    api('GET', '/news?limit=20' + (tab === 'mine' ? '&teamId=' + teamIds : ''))
      .then((r) => { setList(r); setMore(r.length === 20) })
      .catch((e) => { setList([]); setErr(e.message) })
  }, [tab, teamIds])
  useEffect(() => { if (user && !favLoaded) loadFavs() }, [user, favLoaded, loadFavs])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (admin) api('GET', '/teams').then(setTeams).catch(() => {}) }, [admin])

  const loadMore = async () => {
    const last = list[list.length - 1]
    try {
      const r = await api('GET', '/news?limit=20&before=' + encodeURIComponent(last.publishedAt) + (tab === 'mine' ? '&teamId=' + teamIds : ''))
      setList([...list, ...r]); setMore(r.length === 20)
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Noticias</h1>
        {admin && !writing && <button onClick={() => setWriting(true)} className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-extrabold uppercase text-black"><Plus size={14} /> Nueva</button>}
      </div>
      {writing && <Editor teams={teams} onCancel={() => setWriting(false)} onSaved={() => { setWriting(false); setTab('all'); load() }} />}
      <div className="flex gap-2">
        {[['all', 'Todas'], ['mine', 'Mi equipo']].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)} className={'rounded-full border px-4 py-1.5 text-xs font-bold ' + (tab === v ? 'border-accent bg-accent text-black' : 'border-line bg-surface-2')}>{l}</button>
        ))}
      </div>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {list === null && <Skeleton rows={3} />}
      {list?.length === 0 && (
        <p className="text-sm text-muted">
          {tab === 'mine' ? (teamIds ? 'Todavía no hay noticias de tus equipos.' : 'Seguí un equipo (desde su página) y acá vas a ver sus noticias.') : 'Todavía no hay noticias.'}
        </p>
      )}
      <div className="space-y-3">{(list ?? []).map((n) => <NewsCard key={n.id} n={n} />)}</div>
      {list && more && list.length > 0 && <button onClick={loadMore} className="w-full rounded-xl border border-line py-2.5 text-xs font-extrabold uppercase tracking-wide text-accent">Ver más</button>}
    </div>
  )
}
