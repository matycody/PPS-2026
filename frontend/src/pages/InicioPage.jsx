import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { onboardingDone, markOnboarding } from '../lib/onboarding'
import HomeInicio from '../components/inicio/HomeInicio'
import { useMatchesFeed } from '../hooks/useMatchesFeed'
import { useMatchesStore } from '../stores/matchesStore'
import { GENERAL, ITEMS } from '../lib/navConfig'
import { useAuthStore } from '../stores/authStore'
import PlayerRequestBanner from '../components/PlayerRequestBanner'
import { roleLabel } from '../lib/navConfig'

const ORG_DAYS = 30 // se carga más lejos para encontrar la próxima jornada

export default function InicioPage() {
  const { user, menu } = useAuthStore()
  const role = roleLabel(user, menu) // ej.: Organizador, Árbitro / Jugador, Jugador o Registrado
  useMatchesFeed(ORG_DAYS)
  const navigate = useNavigate()
  const uid = user?.id
  const isAdmin = !!user?.roles?.includes('ADMIN')

  // Primera vez sin favoritos: pantalla de bienvenida para elegir equipos y torneos
  useEffect(() => {
    if (!uid || isAdmin || onboardingDone(uid)) return
    let alive = true
    api('GET', '/favorites')
      .then((f) => { if (!alive) return; if (f.length === 0) navigate('/bienvenida', { replace: true }); else markOnboarding(uid) })
      .catch(() => {})
    return () => { alive = false }
  }, [uid, isAdmin, navigate])
  const { byId, loading, error } = useMatchesStore()

  const shortcuts = (
      <div className="flex gap-2">
        {[
          ...GENERAL.slice(0, 3),
          ...(role.includes('Organizador') || role.includes('Árbitro') || user?.roles?.includes('PLAYER') || menu.includes('control_mesa') ? [ITEMS.control_mesa] : []),
          ...(menu.includes('usuarios') ? [ITEMS.usuarios] : []),
        ].filter((c) => !(user?.roles?.includes('ADMIN') && c.to === '/estadisticas')).map(({ to, label, Icon, soon }) => (
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
