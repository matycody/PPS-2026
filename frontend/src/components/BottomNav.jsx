import { NavLink } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { ITEMS, BOTTOM_PRIORITY } from '../lib/navConfig'

export default function BottomNav() {
  const { user, menu } = useAuthStore()

  const items = user
    ? [...BOTTOM_PRIORITY.filter((k) => menu.includes(k)).slice(0, 3).map((k) => ITEMS[k]), ITEMS.perfil]
    : [ITEMS.home, { to: '/login', label: 'Ingresar', Icon: LogIn }]

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-2xl pb-[env(safe-area-inset-bottom)]">
        {items.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ' +
              (isActive ? 'text-accent' : 'text-muted')
            }
          >
            <Icon size={22} />
            <span className="max-w-full truncate px-1">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
