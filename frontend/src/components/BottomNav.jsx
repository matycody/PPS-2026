import { NavLink } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { ITEMS, BOTTOM_PRIORITY, NOTICIAS } from '../lib/navConfig'

export function bottomItems(user, menu = []) {
  const isAdmin = !!user?.roles?.includes('ADMIN')
  return user
    ? [ITEMS.home, NOTICIAS, ...BOTTOM_PRIORITY.filter((k) => k !== 'home' && menu.includes(k) && ITEMS[k] && (!isAdmin || k === 'dashboard_canchas' || k === 'partidos')).slice(0, 2).map((k) => ITEMS[k]), ...(isAdmin ? [] : [ITEMS.perfil])]
    : [ITEMS.home, NOTICIAS, { to: '/login', label: 'Ingresar', Icon: LogIn }]
}

export default function BottomNav() {
  const { user, menu } = useAuthStore()
  const items = bottomItems(user, menu)

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line menu-glass">
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
