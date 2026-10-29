import { useState } from 'react'
import { AtSign, Mail, Lock, ChevronDown, Eye, EyeOff } from 'lucide-react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

const field = 'w-full rounded-xl border border-line bg-bg px-4 py-3 outline-none focus:border-accent'

// Una fila de la cuenta: muestra el valor actual y, al tocarla, se despliega su editor (una a la vez)
function Row({ id, open, setOpen, Icon, label, value, hint, children }) {
  const on = open === id
  return (
    <div className="border-b border-line last:border-0">
      <button type="button" onClick={() => setOpen(on ? null : id)} aria-expanded={on} className="flex w-full items-center gap-3 px-1 py-3.5 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-accent"><Icon size={18} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-muted">{label}</span>
          <span className="block truncate text-sm font-bold">{value}</span>
        </span>
        <ChevronDown size={18} className={'shrink-0 text-muted transition-transform ' + (on ? 'rotate-180' : '')} />
      </button>
      {on && (
        <div className="space-y-3 pb-4 pl-1 pr-1">
          {hint && <p className="text-xs text-muted">{hint}</p>}
          {children}
        </div>
      )}
    </div>
  )
}

function Actions({ onCancel, onSave, disabled, label = 'Guardar' }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={onCancel} className="rounded-2xl border border-line bg-surface-2 py-3 text-sm font-bold">Cancelar</button>
      <button type="button" disabled={disabled} onClick={onSave} className="rounded-2xl bg-accent py-3 text-sm font-extrabold text-black disabled:opacity-40">{label}</button>
    </div>
  )
}

// Cuenta y seguridad: usuario, mail y contraseña en un solo lugar. run(fn, okMsg) y busy vienen de la página.
export default function CuentaCard({ run, busy, setErr }) {
  const { user } = useAuthStore()
  const [open, setOpen] = useState(null)
  const [uname, setUname] = useState('')
  const [email, setEmail] = useState('')
  const [cur, setCur] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [show, setShow] = useState(false)

  const close = () => { setOpen(null); setUname(''); setEmail(''); setCur(''); setPass(''); setPass2(''); setShow(false) }
  const toggle = (id) => { if (id !== open) { setUname(''); setEmail(''); setCur(''); setPass(''); setPass2(''); setShow(false) } setOpen(id) }

  const saveUsername = () => {
    const v = uname.trim()
    if (!/^[a-zA-Z0-9._]{3,20}$/.test(v)) return setErr('Usuario: 3 a 20 caracteres, solo letras, números, punto y guion bajo')
    run(async () => {
      const r = await api('PATCH', '/me/username', { username: v })
      useAuthStore.setState({ user: { ...useAuthStore.getState().user, username: r.username } })
      close()
    }, 'Usuario guardado')
  }

  const saveEmail = () => run(async () => {
    const { error } = await supabase.auth.updateUser({ email: email.trim() })
    if (error) throw error
    close()
  }, 'Te enviamos un mail de confirmación al mail nuevo. Hasta confirmarlo sigue vigente el actual.')

  const savePassword = () => {
    if (pass.length < 6) return setErr('La contraseña nueva necesita al menos 6 caracteres')
    if (pass !== pass2) return setErr('Las contraseñas nuevas no coinciden')
    run(async () => {
      const check = await supabase.auth.signInWithPassword({ email: user.email, password: cur })
      if (check.error) throw new Error('La contraseña actual no es correcta')
      const { error } = await supabase.auth.updateUser({ password: pass })
      if (error) throw error
      close()
    }, 'Contraseña actualizada')
  }

  const type = show ? 'text' : 'password'
  const eye = (
    <button type="button" onClick={() => setShow((v) => !v)} className="flex items-center gap-2 text-xs font-bold text-muted">
      {show ? <EyeOff size={14} /> : <Eye size={14} />} {show ? 'Ocultar' : 'Mostrar'} contraseñas
    </button>
  )

  return (
    <section className="rounded-3xl border border-line bg-surface px-4 pb-1 pt-4">
      <h2 className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-muted">Cuenta y seguridad</h2>

      <Row id="user" open={open} setOpen={toggle} Icon={AtSign} label="Usuario" value={user?.username ? '@' + user.username : 'Sin definir'}
        hint="Con tu usuario y tu contraseña entrás sin escribir el mail. Solo lo ve la organización.">
        <input className={field} placeholder="Usuario nuevo" maxLength={20} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={uname} onChange={(e) => setUname(e.target.value.replace(/\s/g, ''))} />
        <Actions onCancel={close} onSave={saveUsername} disabled={busy || !uname.trim() || uname.trim().toLowerCase() === (user?.username ?? '')} />
      </Row>

      <Row id="mail" open={open} setOpen={toggle} Icon={Mail} label="Mail" value={user?.email ?? '—'}
        hint="Te mandamos un mail de confirmación al nuevo. Hasta confirmarlo sigue vigente el actual.">
        <input className={field} type="email" placeholder="Mail nuevo" autoCapitalize="none" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Actions onCancel={close} onSave={saveEmail} disabled={busy || !email.trim()} />
      </Row>

      <Row id="pass" open={open} setOpen={toggle} Icon={Lock} label="Contraseña" value="••••••••">
        <input className={field} type={type} placeholder="Contraseña actual" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        <input className={field} type={type} placeholder="Contraseña nueva (mínimo 6)" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        <input className={field} type={type} placeholder="Repetir contraseña nueva" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
        {eye}
        <Actions onCancel={close} onSave={savePassword} disabled={busy || !cur || !pass || !pass2} label="Cambiar" />
      </Row>
    </section>
  )
}
