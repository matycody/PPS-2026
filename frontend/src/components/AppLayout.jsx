import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Menu, Search, ChevronLeft, LogIn } from 'lucide-react'
import Drawer from './Drawer'
import BottomNav from './BottomNav'
import { useAuthStore } from '../stores/authStore'
import UserAvatar from './UserAvatar'
import { useMenuPrefs } from '../stores/menuPrefsStore'
import ServerClock from './ServerClock'
import { useTeamLogos } from '../stores/teamLogosStore'
import { installDragScroll } from '../lib/dragScroll'

// Pantallas que ya traen su propio "volver" con el nombre de la lista a la que vuelven
const OWN_BACK = /^\/(liga|admin\/(torneos|equipos|partidos))\/[^/]+$/

// Botón "Volver" para todas las pantallas internas (iOS no tiene botón de atrás)
function BackBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  if (pathname === '/' || OWN_BACK.test(pathname)) return null // solo el Inicio no lleva "Volver"
  const back = () => (window.history.state && window.history.state.idx > 0 ? navigate(-1) : navigate('/'))
  return (
    <button type="button" onClick={back} className="mb-2 inline-flex items-center gap-1 rounded-full border border-line bg-surface py-1.5 pl-2 pr-3.5 text-sm font-bold text-muted active:bg-surface-2">
      <ChevronLeft size={18} /> Volver
    </button>
  )
}

export default function AppLayout() {
  const [open, setOpen] = useState(false)
  const user = useAuthStore((s) => s.user)
  const look = useMenuPrefs((s) => s.look)
  useEffect(() => { installDragScroll() }, [])
  const loadLogos = useTeamLogos((s) => s.load)
  useEffect(() => { loadLogos() }, [loadLogos])
  useEffect(() => {
    const r = document.documentElement.style
    r.setProperty('--menu-a', look.a + '%')
    r.setProperty('--menu-da', look.da + '%')
    r.setProperty('--menu-blur', look.b + 'px')
  }, [look])

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-2 menu-glass px-3 pb-3 sm:gap-3 sm:px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button
          aria-label="Abrir menú"
          onClick={() => setOpen(true)}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface sm:h-11 sm:w-11"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold leading-tight sm:text-xl">Dodgeball</p>
          <div className="truncate leading-none"><ServerClock /></div>
        </div>
        <Link to="/buscar" aria-label="Buscar" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line bg-surface sm:h-11 sm:w-11">
          <Search size={20} />
        </Link>
        {user ? (
          <Link to="/perfil" className="shrink-0"><UserAvatar /></Link>
        ) : (
          <Link to="/login" aria-label="Ingresar" className="flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-black">
            <LogIn size={16} className="min-[400px]:hidden" /><span className="max-[399px]:hidden">Ingresar</span>
          </Link>
        )}
      </header>

      <main className="flex-1 px-4 pb-28 pt-2">
        <BackBar />
        <Outlet />
      </main>

      <BottomNav />
      <Drawer open={open} onClose={() => setOpen(false)} />
    </div>
  )
}



