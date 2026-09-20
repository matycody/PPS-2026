import { NavLink, Link } from 'react-router-dom'
import { X, LogOut, LogIn } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { ITEMS, SECTIONS, GENERAL, roleLabel } from '../lib/navConfig'

function Item({ to, label, Icon, soon, onClose }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClose}
      className={({ isActive }) =>
        'flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold ' +
        (isActive ? 'bg-accent-soft text-accent' : 'text-fg')
      }
    >
      <Icon size={20} className="shrink-0" />
      <span className="flex-1">{label}</span>
      {soon && <span className="text-[10px] font-bold uppercase text-muted">Pronto</span>}
    </NavLink>
  )
}

function Title({ children }) {
  return <p className="mb-1 mt-5 px-3 text-[11px] font-bold uppercase tracking-widest text-accent">{children}</p>
}

export default function Drawer({ open, onClose }) {
  const { user, menu, signOut } = useAuthStore()
  const initials = (user?.email ?? '?').slice(0, 2).toUpperCase()

  return (
    <div className={'fixed inset-0 z-40 ' + (open ? '' : 'pointer-events-none')}>
      <div
        onClick={onClose}
        className={'absolute inset-0 bg-black/60 transition-opacity ' + (open ? 'opacity-100' : 'opacity-0')}
      />
      <aside
        className={
          'absolute left-0 top-0 flex h-full w-80 max-w-[85%] flex-col overflow-y-auto bg-bg p-5 transition-transform duration-200 ' +
          (open ? 'translate-x-0' : '-translate-x-full')
        }
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-accent">Navegación</p>
            <p className="mt-1 text-2xl font-extrabold leading-tight">Cronómetro Dodgeball</p>
          </div>
          <button aria-label="Cerrar" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-sm font-extrabold text-black">{initials}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{user ? user.email : 'Visitante'}</p>
            <p className="text-xs text-muted">{user ? 'Sesión iniciada' : 'Solo lectura'}</p>
          </div>
          {user && (
            <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold uppercase text-accent">
              {roleLabel(user, menu)}
            </span>
          )}
        </div>

        <nav className="mt-4">
          <Item {...ITEMS.home} label="Menú principal" onClose={onClose} />

          {SECTIONS.map((s) => {
            const keys = s.keys.filter((k) => menu.includes(k))
            if (!keys.length) return null
            return (
              <div key={s.title}>
                <Title>{s.title}</Title>
                {keys.map((k) => <Item key={k} {...ITEMS[k]} onClose={onClose} />)}
              </div>
            )
          })}

          <Title>General</Title>
          {GENERAL.map((g) => <Item key={g.to} {...g} onClose={onClose} />)}
          {menu.includes('perfil') && <Item {...ITEMS.perfil} onClose={onClose} />}
        </nav>

        <div className="mt-auto border-t border-line pt-4">
          {user ? (
            <button
              onClick={() => { onClose(); signOut() }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold text-danger"
            >
              <LogOut size={20} /> Cerrar sesión
            </button>
          ) : (
            <Link to="/login" onClick={onClose} className="flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold text-accent">
              <LogIn size={20} /> Ingresar / Registrarse
            </Link>
          )}
        </div>
      </aside>
    </div>
  )
}
