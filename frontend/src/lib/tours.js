import { useTourStore } from '../stores/tourStore'

// Tutoriales in-app. Cada paso: { target?, title, text, when? }
//  - target: selector CSS del elemento a resaltar (data-tour="..."); sin target el paso va centrado
//  - when(ctx): el paso solo se muestra si devuelve true. ctx = { loggedIn, isAdmin, canOperate }
// Mantener los textos cortos (mobile first): 3 a 6 pasos por pantalla.

const SHELL = {
  menu: { target: '[data-tour="menu"]', title: 'Menú', text: 'Acá están todas tus secciones: partidos, equipos, ranking, sedes y más. Cambia según tu rol.' },
  search: { target: '[data-tour="search"]', title: 'Buscar', text: 'Encontrá equipos, jugadores y torneos. Guarda tus búsquedas recientes.' },
  accountIn: { target: '[data-tour="account"]', title: 'Tu perfil', text: 'Tu cuenta, el tema, los colores y tus favoritos.', when: (c) => c.loggedIn },
  accountOut: { target: '[data-tour="account"]', title: 'Ingresar', text: 'Iniciá sesión para tener favoritos, predecir resultados y ver Ranking y Sedes.', when: (c) => !c.loggedIn },
  bottom: { target: '[data-tour="bottomnav"]', title: 'Accesos rápidos', text: 'La barra de abajo lleva a lo que más usás. Noticias siempre está acá.' },
}

export const TOURS = {
  inicio: [
    { title: 'Bienvenido a Dodgeball BA', text: 'Te mostramos lo básico en menos de un minuto. Podés saltearlo con la X de arriba a la derecha.' },
    SHELL.menu,
    SHELL.search,
    SHELL.accountIn,
    SHELL.accountOut,
    SHELL.bottom,
    { title: 'Inicio', text: 'Elegí el día en la tira de jornadas y el torneo en la tira de torneos. "En vivo" muestra los partidos que se están jugando. Tocá un partido para ver el detalle.' },
  ],

  partido: [
    { title: 'Resumen del partido', text: 'Acá ves los relojes de partido y de set en vivo, el marcador y el tiempo muerto. Con la chincheta fijás un reloj flotante que te sigue en otras pantallas.' },
    { title: 'Pestañas', text: 'Resumen, Jugadores (con sus sanciones), Detalles (árbitros y mesa) y Cara a cara entre los dos equipos, por modalidad.' },
    { title: 'Predicciones', text: 'En los partidos que todavía no empezaron podés predecir quién gana y sumar puntos. No podés predecir a tu propio equipo.', when: (c) => c.loggedIn },
  ],

  control: [
    { title: 'Control de mesa', text: 'Desde acá operás el reloj de partido y el de set. Solo una persona opera por partido; las demás ven en solo lectura.' },
    { title: 'Sanciones', text: 'Advertencia, Amarilla, Azul y Roja. Corren con el reloj del partido y se congelan en pausa.' },
    { title: 'Sets', text: 'El desplegable "Sets" guarda la línea de tiempo del marcador. Si tenés permiso, la X de cada set lo corrige.' },
    { title: 'Tiempo muerto', text: 'Si te equivocás, "Deshacer tiempo muerto" lo anula. Al salir del partido te pide confirmar.' },
    { title: 'Finalizar', text: 'El partido termina solo cuando la mesa o el árbitro lo finalizan: ahí queda en 00:00 y 2.º tiempo.' },
  ],

  asignaciones: [
    { title: 'Mis asignaciones', text: 'Tus próximos partidos como árbitro o mesa, todos en una sola pantalla.' },
    { title: 'Operar un partido', text: 'Tocá el partido para abrir el control cuando esté habilitado. El Historial está aparte, en el menú.' },
  ],

  predicciones: [
    { title: 'Predicciones', text: 'Predecí el resultado de los partidos y sumá puntos (sin dinero). Hay calendario, torneos, favoritos y tus predicciones.' },
    { title: 'Cuotas y bonus', text: 'Las cuotas son decimales y se mueven hasta que el partido se habilita. Cuanto antes predecís, más bonus.' },
    { title: 'Reglas', text: 'En llaves, playoffs y ascenso/descenso no hay empate. No podés predecir a tu equipo, y si te designan árbitro o mesa tu predicción se anula.', when: (c) => c.loggedIn },
    { title: 'Clasificación', text: 'Hay ranking por torneo y anual.' },
  ],

  perfil: [
    { title: 'Tu perfil', text: 'Acá administrás tu cuenta y cómo ves la app.' },
    { title: 'Cuenta y seguridad', text: 'Cambiá tu mail, tu usuario y tu contraseña (te pide la actual).' },
    { title: 'Personalización', text: 'Elegí tema (Azul noche, Celeste o Acero), colores y el orden de tu menú.' },
    { title: 'Repetir tutoriales', text: 'Abajo de todo está "Ver los tutoriales de nuevo".' },
  ],

  ranking: [
    { title: 'Ranking', text: 'Resumen (campeón, ranking y récords), Estadísticas de equipos, Salón de la fama, Torneos, Equipos y Cara a cara.' },
    { title: 'Filtros', text: 'Los filtros por año, modalidad y rama están plegados: tocá para abrirlos.' },
  ],

  dashboard: [
    { title: 'Dashboard de canchas', text: 'Pestaña "Todas" y una por cancha. Se muestra una jornada por vez.', when: (c) => c.isAdmin },
    { title: 'Operar los partidos', text: 'Podés habilitar, editar sets y finalizar partidos al momento. Cada cancha muestra los 8 próximos con "Ver más".', when: (c) => c.isAdmin },
  ],

  jornada: [
    { title: 'Armar jornada', text: 'Tablero de canchas por horarios. Asigná los partidos a mano o usá "Autoarmar".', when: (c) => c.isAdmin },
    { title: 'Minutos por turno', text: 'Elegí cuánto dura cada turno (40 por defecto) antes de guardar la jornada.', when: (c) => c.isAdmin },
  ],

  torneos: [
    { title: 'Torneos', text: 'Creá un torneo, cargá equipos y armá zonas, fixture y llaves.', when: (c) => c.isAdmin },
    { title: 'Pausar y reiniciar', text: '"Pausar" oculta el torneo a todos menos a la organización. "Reiniciar" borra resultados: solo para pruebas y demos.', when: (c) => c.isAdmin },
    { title: 'Eliminados', text: 'Los torneos eliminados quedan en "Eliminados": desde ahí se restauran o se borran del todo.', when: (c) => c.isAdmin },
  ],

  sanciones: [
    { title: 'Departamento de sanciones', text: 'Pestaña Jugadores (pendientes, vigentes y evaluadas) y pestaña Equipos (quitas de puntos).', when: (c) => c.isAdmin },
    { title: 'Roja y suspensión', text: 'Cuando hay una roja, vos decidís la suspensión: resto de la jornada y/o N fechas, y en qué modalidades.', when: (c) => c.isAdmin },
    { title: 'Nueva sanción', text: 'También podés sancionar a un jugador por una falta fuera del partido, o quitarle puntos a un equipo en su zona.', when: (c) => c.isAdmin },
  ],
}

// Ruta -> tutorial
const ROUTES = [
  [/^\/$/, 'inicio'],
  [/^\/partido\/[^/]+$/, 'partido'],
  [/^\/control\/[^/]+$/, 'control'],
  [/^\/asignaciones$/, 'asignaciones'],
  [/^\/predicciones$/, 'predicciones'],
  [/^\/perfil$/, 'perfil'],
  [/^\/estadisticas$/, 'ranking'],
  [/^\/admin\/canchas$/, 'dashboard'],
  [/^\/admin\/jornada$/, 'jornada'],
  [/^\/admin\/torneos$/, 'torneos'],
  [/^\/admin\/sanciones$/, 'sanciones'],
]

export const tourKeyFor = (pathname) => ROUTES.find(([re]) => re.test(pathname))?.[1] ?? null

export const tourContext = (user, menu = []) => ({
  loggedIn: !!user,
  isAdmin: !!user?.roles?.includes('ADMIN'),
  canOperate: menu.includes('asignaciones'),
})

// Arranca el tutorial de una pantalla (solo con los pasos que le tocan a este rol)
export function startTour(key, user, menu) {
  const ctx = tourContext(user, menu)
  const steps = (TOURS[key] ?? []).filter((s) => !s.when || s.when(ctx))
  useTourStore.getState().start(key, steps, user?.id)
}
