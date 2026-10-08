import { Link, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import Drawer from './Drawer'
import BottomNav from './BottomNav'
import { useAuthStore } from '../stores/authStore'
import UserAvatar from './UserAvatar'
import { useMenuPrefs } from '../stores/menuPrefsStore'
import ServerClock from './ServerClock'

export default function AppLayout() {
  const [open, setOpen] = useState(false)
  const user = useAuthStore((s) => s.user)
  const look = useMenuPrefs((s) => s.look)
  useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--menu-a', look.a + '%')
    r.setProperty('--menu-da', look.da + '%')
    r.setProperty('--menu-blur', look.b + 'px')
  }, [look])

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 menu-glass px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button
          aria-label="Abrir menú"
          onClick={() => setOpen(true)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-surface"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Dodgeball</p>
            <ServerClock />
          </div>
          <p className="truncate text-lg font-extrabold leading-tight">Cronómetro Dodgeball</p>
        </div>
        {user ? (
          <Link to="/perfil" className="shrink-0"><UserAvatar /></Link>
        ) : (
          <Link to="/login" className="shrink-0 rounded-xl bg-accent px-4 py-2 text-sm font-bold text-black">
            Ingresar
          </Link>
        )}
      </header>

      <main className="flex-1 px-4 pb-28 pt-2">
        <Outlet />
      </main>

      <BottomNav />
      <Drawer open={open} onClose={() => setOpen(false)} />
    </div>
  )
}



