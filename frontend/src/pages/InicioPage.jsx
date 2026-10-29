import { Link } from 'react-router-dom'
import HomeInicio from '../components/inicio/HomeInicio'
import { useMatchesFeed } from '../hooks/useMatchesFeed'
import { useMatchesStore } from '../stores/matchesStore'
import { GENERAL, ITEMS } from '../lib/navConfig'
import { useAuthStore } from '../stores/authStore'
import PlayerRequestBanner from '../components/PlayerRequestBanner'
import { roleLabel } from '../lib/navConfig'
import { useMenuPrefs } from '../stores/menuPrefsStore'

const ORG_DAYS = 30 // se carga más lejos para encontrar la próxima jornada

export default function InicioPage() {
  const { user, menu } = useAuthStore()
  const role = roleLabel(user, menu) // Organizador, Árbitro, Mesa, Jugador o Registrado
  useMatchesFeed(ORG_DAYS)
  const cardsPref = useMenuPrefs((s) => s.byUser[user?.id]?.cards)
  const { byId, loading, error } = useMatchesStore()

  const shortcuts = (
      <div className="flex gap-2">
        {[
          ...GENERAL.slice(0, 3),
          ...(role === 'Organizador' || role === 'Árbitro' || menu.includes('control_mesa') ? [ITEMS.control_mesa] : []),
          ...(menu.includes('usuarios') ? [ITEMS.usuarios] : []),
        ].filter((c) => !cardsPref || cardsPref.includes(c.to)).filter((c) => !(user?.roles?.includes('ADMIN') && c.to === '/estadisticas')).map(({ to, label, Icon, soon }) => (
          <Link key={to} to={to} className="flex min-w-0 flex-1 flex-col items-center justify-start gap-1.5 break-words rounded-2xl border border-line bg-surface px-1 py-3 text-center text-[10px] font-semibold leading-tight sm:text-sm">
            <Icon size={22} className="text-accent" />
            {label}
            {soon && <span className="text-[7px] font-bold uppercase text-muted sm:text-[10px]">Próximamente</span>}
          </Link>
        ))}
      </div>
  )

  return (
    <div className="space-y-5">
      <PlayerRequestBanner />
      <HomeInicio byId={byId} loading={loading} error={error}>{shortcuts}</HomeInicio>
    </div>
  )
}
