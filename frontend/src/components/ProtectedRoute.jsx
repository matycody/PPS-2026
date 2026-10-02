import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

// need: clave del menú requerida (ej. "control_mesa"). Sin need, basta con tener sesión.
export default function ProtectedRoute({ need }) {
  const { user, menu, loading } = useAuthStore()
  const location = useLocation()

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-muted">Cargando…</div>
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (need && !menu.includes(need)) return <Navigate to="/" replace />
  return <Outlet />
}
