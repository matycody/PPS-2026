import {
  Home, Heart, User, CalendarDays, Users, BarChart3, ClipboardList,
  LayoutDashboard, Target, Trophy, Shield, UserCog, History as HistoryIcon, Timer, BookOpen, Info, Newspaper, MapPin, Gavel, ClipboardCheck,
} from 'lucide-react'

// Claves que manda el backend en GET /me → menu (importar_excel no se usa)
export const ITEMS = {
  home: { to: '/', label: 'Inicio', Icon: Home },
  favoritos: { to: '/favoritos', label: 'Favoritos', Icon: Heart },
  perfil: { to: '/perfil', label: 'Mi perfil', Icon: User },
  mis_partidos: { to: '/mis-partidos', label: 'Mis partidos', Icon: CalendarDays },
  mi_equipo: { to: '/mi-equipo', label: 'Ficha de mi equipo', Icon: Users },
  mis_estadisticas: { to: '/mis-estadisticas', label: 'Mis estadísticas', Icon: BarChart3 },
  historial_asignaciones: { to: '/asignaciones/historial', label: 'Historial', Icon: HistoryIcon },
  asignaciones: { to: '/asignaciones', label: 'Mis asignaciones', Icon: ClipboardList }, // árbitro + mesa en una sola pantalla
  dashboard_canchas: { to: '/admin/canchas', label: 'Dashboard de canchas', Icon: LayoutDashboard },
  torneos: { to: '/admin/torneos', label: 'Torneos', Icon: Trophy },
  partidos: { to: '/admin/partidos', label: 'Partidos', Icon: CalendarDays },
  equipos: { to: '/admin/equipos', label: 'Equipos', Icon: Users },
  sedes: { to: '/admin/sedes', label: 'Sedes', Icon: MapPin },
  sanciones: { to: '/admin/sanciones', label: 'Sanciones', Icon: Gavel },
  personas: { to: '/admin/personas', label: 'Personas', Icon: UserCog },
  usuarios: { to: '/admin/usuarios', label: 'Usuarios y roles', Icon: Shield },
  planillas: { to: '/admin/planillas', label: 'Planillas de juego', Icon: ClipboardCheck },
  registro_ediciones: { to: '/admin/ediciones', label: 'Registro de ediciones', Icon: HistoryIcon },
}

// Secciones del drawer, en orden
export const SECTIONS = [
  { title: 'Mi actividad', keys: ['mis_partidos', 'mi_equipo', 'mis_estadisticas', 'favoritos'] },
  { title: 'Árbitro y mesa', keys: ['asignaciones', 'historial_asignaciones'] },
  { title: 'Administración', keys: ['dashboard_canchas', 'torneos', 'partidos', 'equipos', 'sedes', 'sanciones', 'personas', 'usuarios', 'planillas', 'registro_ediciones'] },
]

// Rutas fijas del frontend (no dependen del menú del backend)
export const GENERAL = [
  { to: '/cronometro', label: 'Cronómetro offline', Icon: Timer },
  { to: '/liga', label: 'Competiciones', Icon: Trophy },
  { to: '/estadisticas', label: 'Ranking', Icon: BarChart3 },
  // (va después de los 3 primeros: son los accesos del Inicio)
  // El organizador ya tiene 'Partidos' (con edición) en Administración; los demás roles lo ven solo para consultar
  { to: '/partidos', label: 'Partidos', Icon: CalendarDays, hideIf: 'partidos' },
  { to: '/noticias', label: 'Noticias', Icon: Newspaper, bottomOnly: true }, // fija en la barra inferior para todos (no va en el drawer)
  { to: '/predicciones', label: 'Predicciones', Icon: Target },
  // El organizador ya tiene 'Equipos' en Administración
  { to: '/equipos', label: 'Equipos', Icon: Users, hideIf: 'equipos' },
  // El organizador ya tiene 'Sedes' (con edición) en Administración
  { to: '/sedes', label: 'Sedes', Icon: MapPin, hideIf: 'sedes' },
  { to: '/reglas', label: 'Reglas del juego', Icon: BookOpen, soon: true },
  { to: '/acerca', label: 'Acerca de / Contacto', Icon: Info, soon: true },
]

// Los 3 primeros que existan en el menú van al bottom nav (+ Perfil)
export const NOTICIAS = GENERAL.find((g) => g.to === '/noticias')

export const BOTTOM_PRIORITY = [
  'home', 'dashboard_canchas', 'partidos', 'asignaciones',
  'mis_partidos', 'favoritos',
]

// Entradas de GENERAL que corresponden al menú de esta persona
export const generalFor = (menu = []) => GENERAL.filter((g) => !g.bottomOnly && (!g.hideIf || !menu.includes(g.hideIf)) && (!g.showIf || menu.includes(g.showIf)))

// "Mesa" no es un rol explícito: quien opera la mesa figura como Jugador (o lo que sea además)
export function roleLabel(user) {
  const r = user?.roles ?? []
  const out = []
  if (r.includes('ADMIN')) out.push('Organizador')
  if (r.includes('REFEREE')) out.push('Árbitro')
  if (r.includes('PLAYER') || user?.profileId) out.push('Jugador')
  return out.length ? out.join(' / ') : 'Registrado'
}

// Un ítem solo se marca activo en su ruta exacta si otro ítem cuelga de ella (ej. /asignaciones y /asignaciones/historial)
const NAV_PATHS = [...Object.values(ITEMS).map((i) => i.to), ...GENERAL.map((g) => g.to)].filter(Boolean)
export const navEnd = (to) => to === '/' || NAV_PATHS.some((p) => p !== to && p.startsWith(to + '/'))
