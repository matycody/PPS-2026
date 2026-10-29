import {
  Home, Heart, User, CalendarDays, Users, BarChart3, ClipboardList, Gamepad2,
  LayoutDashboard, Trophy, Shield, UserCog, History as HistoryIcon, Timer, BookOpen, Info, Newspaper,
} from 'lucide-react'

// Claves que manda el backend en GET /me → menu (importar_excel no se usa)
export const ITEMS = {
  home: { to: '/', label: 'Inicio', Icon: Home },
  favoritos: { to: '/favoritos', label: 'Favoritos', Icon: Heart },
  perfil: { to: '/perfil', label: 'Mi perfil', Icon: User },
  mis_partidos: { to: '/mis-partidos', label: 'Mis partidos', Icon: CalendarDays },
  mi_equipo: { to: '/mi-equipo', label: 'Ficha de mi equipo', Icon: Users },
  mis_estadisticas: { to: '/mis-estadisticas', label: 'Mis estadísticas', Icon: BarChart3, soon: true },
  mis_partidos_asignados: { to: '/asignados', label: 'Mis partidos asignados', Icon: ClipboardList },
  control_mesa: { to: '/mesa', label: 'Control de mesa', Icon: Gamepad2 },
  dashboard_canchas: { to: '/admin/canchas', label: 'Dashboard de canchas', Icon: LayoutDashboard },
  torneos: { to: '/admin/torneos', label: 'Torneos', Icon: Trophy },
  partidos: { to: '/admin/partidos', label: 'Partidos', Icon: CalendarDays },
  equipos: { to: '/admin/equipos', label: 'Equipos', Icon: Users },
  personas: { to: '/admin/personas', label: 'Personas', Icon: UserCog },
  usuarios: { to: '/admin/usuarios', label: 'Usuarios y roles', Icon: Shield },
  registro_ediciones: { to: '/admin/ediciones', label: 'Registro de ediciones', Icon: HistoryIcon },
}

// Secciones del drawer, en orden
export const SECTIONS = [
  { title: 'Mi actividad', keys: ['mis_partidos', 'mi_equipo', 'mis_estadisticas', 'favoritos'] },
  { title: 'Funciones de árbitro', keys: ['mis_partidos_asignados'] },
  { title: 'Mesa', keys: ['control_mesa'] },
  { title: 'Administración', keys: ['dashboard_canchas', 'torneos', 'partidos', 'equipos', 'personas', 'usuarios', 'registro_ediciones'] },
]

// Rutas fijas del frontend (no dependen del menú del backend)
export const GENERAL = [
  { to: '/cronometro', label: 'Cronómetro offline', Icon: Timer },
  { to: '/liga', label: 'Liga o copas', Icon: Trophy },
  { to: '/estadisticas', label: 'Estadísticas', Icon: BarChart3 },
  { to: '/noticias', label: 'Noticias', Icon: Newspaper, soon: true, bottomOnly: true }, // fija en la barra inferior para todos (no va en el drawer)
  // El organizador ya tiene 'Equipos' en Administración
  { to: '/equipos', label: 'Equipos', Icon: Users, hideIf: 'equipos' },
  { to: '/reglas', label: 'Reglas del juego', Icon: BookOpen, soon: true },
  { to: '/acerca', label: 'Acerca de / Contacto', Icon: Info, soon: true },
]

// Los 3 primeros que existan en el menú van al bottom nav (+ Perfil)
export const NOTICIAS = GENERAL.find((g) => g.to === '/noticias')

export const BOTTOM_PRIORITY = [
  'home', 'dashboard_canchas', 'partidos', 'mis_partidos_asignados',
  'control_mesa', 'mis_partidos', 'favoritos',
]

// Entradas de GENERAL que corresponden al menú de esta persona
export const generalFor = (menu = []) => GENERAL.filter((g) => !g.bottomOnly && (!g.hideIf || !menu.includes(g.hideIf)) && (!g.showIf || menu.includes(g.showIf)))

export function roleLabel(user, menu = []) {
  const r = user?.roles ?? []
  if (r.includes('ADMIN')) return 'Organizador'
  if (r.includes('REFEREE')) return 'Árbitro'
  if (menu.includes('control_mesa')) return 'Mesa'
  if (r.includes('PLAYER')) return 'Jugador'
  return 'Registrado'
}

