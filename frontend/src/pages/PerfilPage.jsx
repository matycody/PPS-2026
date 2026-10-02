import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, LogOut, Trash2 } from 'lucide-react'
import { api, apiUploadPhoto } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { BRANCH } from '../lib/format'
import { roleLabel } from '../lib/navConfig'
import PersonName from '../components/PersonName'

function Card({ title, children }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{title}</h2>
      {children}
    </section>
  )
}

export default function PerfilPage() {
  const { user, menu, signOut, refreshProfile } = useAuthStore()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [nick, setNick] = useState('')
  const [num, setNum] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = () => api('GET', '/me/profile').then(setData).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  const p = data?.profile
  useEffect(() => {
    if (!p) return
    setNick(p.nickname ?? '')
    setNum(p.number == null ? '' : String(p.number))
  }, [p?.nickname, p?.number])

  async function run(fn, ok) {
    setBusy(true); setErr(''); setMsg('')
    try { await fn(); if (ok) setMsg(ok) } catch (e) { setErr(e.data?.errors?.join(' · ') || e.message) } finally { setBusy(false) }
  }

  const onFile = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) return setErr('Usá una imagen JPG, PNG o WebP')
    if (f.size > 5 * 1024 * 1024) return setErr('La imagen supera los 5 MB')
    run(async () => { await apiUploadPhoto(f); await load(); await refreshProfile() }, 'Foto actualizada')
  }

  const saveExtras = () => {
    if (num !== '' && !/^\d{1,3}$/.test(num)) return setErr('El número tiene que estar entre 0 y 999')
    run(async () => {
      await api('PATCH', '/me/profile', { nickname: nick.trim() || null, number: num === '' ? null : Number(num) })
      await load()
      await refreshProfile()
    }, 'Datos guardados')
  }

  const initials = (user?.email ?? '?').slice(0, 2).toUpperCase()
  const field = 'w-full rounded-xl border border-line bg-bg px-4 py-3 outline-none focus:border-accent'

  return (
    <div className="space-y-4">
      {err && <p className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm font-bold text-danger">{err}</p>}
      {msg && <p className="rounded-2xl border border-live/40 bg-live/10 px-4 py-3 text-sm font-bold text-live">{msg}</p>}

      <div className="flex items-center gap-4 rounded-3xl border border-line bg-surface p-5">
        <div className="relative shrink-0">
          {data?.photoUrl ? (
            <img src={data.photoUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div className="grid h-20 w-20 place-items-center rounded-full bg-accent text-2xl font-extrabold text-black">{initials}</div>
          )}
          <button
            aria-label="Cambiar foto"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border border-line bg-surface-2"
          >
            <Camera size={15} />
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="hidden" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold">
            <PersonName p={p} fallback={user?.email} />
          </p>
          <p className="text-sm text-muted">{roleLabel(user, menu)}</p>
          {data?.photoUrl && (
            <button disabled={busy} onClick={() => run(async () => { await api('DELETE', '/me/photo'); await load(); await refreshProfile() }, 'Foto eliminada')} className="mt-1 text-xs font-semibold text-danger">
              Quitar foto
            </button>
          )}
        </div>
      </div>

      {p && (
        <Card title="Apodo y número (opcional)">
          <div className="space-y-3">
            <label className="block text-xs text-muted">Apodo
              <input
                className={field + ' mt-1'}
                placeholder="Reemplaza tu nombre en la app"
                maxLength={30}
                value={nick}
                onChange={(e) => setNick(e.target.value)}
              />
            </label>
            <label className="block text-xs text-muted">Número (0 a 999)
              <input
                className={field + ' mt-1 font-mono'}
                placeholder="Ej.: 7"
                inputMode="numeric"
                maxLength={3}
                value={num}
                onChange={(e) => setNum(e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
            </label>
            <button
              disabled={busy}
              onClick={saveExtras}
              className="w-full rounded-2xl bg-accent py-3 font-extrabold text-black disabled:opacity-40"
            >
              Guardar
            </button>
            <p className="text-[11px] text-muted">Dejalos vacíos para volver a mostrar tu nombre y ocultar el número.</p>
          </div>
        </Card>
      )}

      {p && (
        <Card title="Mis datos">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Nombre</dt><dd className="truncate pl-4">{p.name}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Mail</dt><dd className="truncate pl-4">{user?.email}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">DNI</dt><dd>{p.dni}</dd></div>
            {p.sex && <div className="flex justify-between"><dt className="text-muted">Sexo</dt><dd>{p.sex === 'M' ? 'Masculino' : 'Femenino'}</dd></div>}
          </dl>
          {(p.teams ?? []).length > 0 && (
            <div className="mt-4 space-y-2">
              {p.teams.map((t) => (
                <div key={t.teamId + t.branch} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <span className="font-bold">{t.name}</span>
                  <span className="text-muted">{BRANCH[t.branch] ?? t.branch}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card title="Cambiar mail">
        <div className="flex gap-2">
          <input className={field} type="email" placeholder="Mail nuevo" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button
            disabled={busy || !email.trim()}
            onClick={() => run(async () => {
              const { error } = await supabase.auth.updateUser({ email: email.trim() })
              if (error) throw error
              setEmail('')
            }, 'Te enviamos un mail de confirmación al mail nuevo. Hasta confirmarlo sigue vigente el actual.')}
            className="shrink-0 rounded-xl bg-accent px-4 font-bold text-black disabled:opacity-40"
          >
            Guardar
          </button>
        </div>
      </Card>

      <button onClick={() => signOut().then(() => navigate('/'))} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface py-3 font-bold">
        <LogOut size={18} /> Cerrar sesión
      </button>

      <div className="rounded-3xl border border-danger/30 p-5">
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-2 text-sm font-bold text-danger">
            <Trash2 size={16} /> Eliminar mi cuenta
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-bold text-danger">¿Eliminar tu cuenta? No se puede deshacer.</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmDelete(false)} className="rounded-2xl border border-line bg-surface-2 py-3 text-sm font-bold">Cancelar</button>
              <button
                disabled={busy}
                onClick={() => run(async () => { await api('DELETE', '/me', { confirm: true }); await signOut(); navigate('/') })}
                className="rounded-2xl bg-danger py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
