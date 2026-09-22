import { Link, Outlet } from 'react-router-dom'
import { useState } from 'react'
import { Menu } from 'lucide-react'
import Drawer from './Drawer'
import BottomNav from './BottomNav'
import { useAuthStore } from '../stores/authStore'
import UserAvatar from './UserAvatar'

export default function AppLayout() {
  const [open, setOpen] = useState(false)
  const user = useAuthStore((s) => s.user)

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 bg-bg/90 px-4 py-3 backdrop-blur">
        <button
          aria-label="Abrir menú"
          onClick={() => setOpen(true)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line bg-surface"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Dodgeball</p>
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


