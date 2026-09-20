import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import OfflinePage from './pages/OfflinePage'
import LoginPage from './pages/LoginPage'
import Placeholder from './pages/Placeholder'
import InicioPage from './pages/InicioPage'
import MatchPage from './pages/MatchPage'
import AssignmentsPage from './pages/AssignmentsPage'
import ControlPage from './pages/ControlPage'
import PerfilPage from './pages/PerfilPage'
import FavoritosPage from './pages/FavoritosPage'
import TeamPage from './pages/TeamPage'
import MiEquipoPage from './pages/MiEquipoPage'
import DashboardPage from './pages/admin/DashboardPage'
import TorneosPage from './pages/admin/TorneosPage'
import EquiposPage from './pages/admin/EquiposPage'
import AdminTeamPage from './pages/admin/AdminTeamPage'
import PartidosPage from './pages/admin/PartidosPage'
import AdminMatchPage from './pages/admin/AdminMatchPage'
import PersonasPage from './pages/admin/PersonasPage'
import UsuariosPage from './pages/admin/UsuariosPage'
import EdicionesPage from './pages/admin/EdicionesPage'
import AppLayout from './components/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuthStore } from './stores/authStore'
import { accentRole } from './lib/roles'
import { ITEMS, GENERAL } from './lib/navConfig'
import { supabase } from './lib/supabase'
import { socket } from './sockets/socket'
import './App.css'

// TEMPORAL (pruebas): borrar antes del commit
if (import.meta.env.DEV) {
  window.supabase = supabase
  window.socket = socket
}

// TEMPORAL: verificar sesión, roles y menú
function PerfilTemp() {
  const { user, menu } = useAuthStore()
  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold">Sesión</h1>
      <pre className="overflow-x-auto rounded-xl border border-line bg-surface p-4 text-xs">
        {JSON.stringify({ user, menu }, null, 2)}
      </pre>
    </div>
  )
}

const PROTECTED = Object.entries(ITEMS).filter(([k]) => !['home', 'perfil', 'favoritos', 'mi_equipo', 'mis_partidos_asignados', 'control_mesa', 'dashboard_canchas', 'torneos', 'equipos', 'partidos', 'personas', 'usuarios', 'registro_ediciones'].includes(k))

function App() {
  const init = useAuthStore((s) => s.init)
  const user = useAuthStore((s) => s.user)
  const menu = useAuthStore((s) => s.menu)

  useEffect(() => {
    init()
  }, [init])

  return (
    <div data-role={accentRole(user, menu)} className="min-h-screen">
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<AppLayout />}>
            <Route path="/" element={<InicioPage />} />
            <Route path="/partido/:id" element={<MatchPage />} />
            <Route path="/equipo/:id" element={<TeamPage />} />
            <Route path="/cronometro" element={<OfflinePage />} />
            {GENERAL.filter((g) => g.to !== '/cronometro').map((g) => (
              <Route key={g.to} path={g.to} element={<Placeholder title={g.label} />} />
            ))}

            <Route element={<ProtectedRoute />}>
              <Route path="/perfil" element={<PerfilPage />} />
              <Route path="/favoritos" element={<FavoritosPage />} />
              <Route path="/mi-equipo" element={<MiEquipoPage />} />
              <Route path="/control/:id" element={<ControlPage />} />
            </Route>

            <Route element={<ProtectedRoute need="mis_partidos_asignados" />}>
              <Route path="/asignados" element={<AssignmentsPage fn="REFEREE" />} />
            </Route>
            <Route element={<ProtectedRoute need="control_mesa" />}>
              <Route path="/mesa" element={<AssignmentsPage fn="TABLE" />} />
            </Route>

            <Route element={<ProtectedRoute need="dashboard_canchas" />}>
              <Route path="/admin/canchas" element={<DashboardPage />} />
            </Route>
            <Route element={<ProtectedRoute need="torneos" />}>
              <Route path="/admin/torneos" element={<TorneosPage />} />
            </Route>
            <Route element={<ProtectedRoute need="equipos" />}>
              <Route path="/admin/equipos" element={<EquiposPage />} />
              <Route path="/admin/equipos/:id" element={<AdminTeamPage />} />
            </Route>

            <Route element={<ProtectedRoute need="partidos" />}>
              <Route path="/admin/partidos" element={<PartidosPage />} />
              <Route path="/admin/partidos/:id" element={<AdminMatchPage />} />
            </Route>
            <Route element={<ProtectedRoute need="personas" />}>
              <Route path="/admin/personas" element={<PersonasPage />} />
            </Route>
            <Route element={<ProtectedRoute need="usuarios" />}>
              <Route path="/admin/usuarios" element={<UsuariosPage />} />
            </Route>
            <Route element={<ProtectedRoute need="registro_ediciones" />}>
              <Route path="/admin/ediciones" element={<EdicionesPage />} />
            </Route>

            {PROTECTED.map(([key, it]) => (
              <Route key={key} element={<ProtectedRoute need={key} />}>
                <Route path={it.to} element={<Placeholder title={it.label} />} />
              </Route>
            ))}
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  )
}

export default App






