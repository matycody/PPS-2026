import { BookOpen, ChevronDown, Download, LayoutDashboard, Users, Timer, Trophy, Swords, Gavel } from 'lucide-react'

// Resumen del reglamento WDBF 2024 (traducción al español, Argentina). El PDF completo se abre desde el botón de arriba.
const PDF = '/reglamento-wbdf-2024.pdf'

const VISTAZO = [
  ['Pelotas', '5', '6'],
  ['Partido', '2 tiempos de 20 min', '2 tiempos de 20 min'],
  ['Set', '3 minutos', 'Sin límite de tiempo'],
  ['Puntos por set', '2 (empate: 1)', '1'],
  ['Zona neutral', 'Sí', 'No'],
  ['Ventaja', '5 s y "jueguen X pelotas"', '10 s para lanzar'],
  ['Tiempo muerto', 'Entre sets', 'En cualquier momento'],
  ['Tarjeta azul', 'Sí', 'No'],
]

const SECCIONES = [
  {
    Icon: LayoutDashboard, title: 'La cancha y las pelotas',
    items: [
      'La cancha mide 18 m de largo por 9 m de ancho, con al menos 1 m libre alrededor y 4 m de altura sin obstáculos.',
      'Las líneas son de 5 cm. La línea central divide la cancha en dos mitades iguales.',
      'Línea de ataque: a 5,5 m de la línea central en Cloth y a 3 m en Foam. Solo en Cloth hay una zona neutral de 4 m alrededor de la línea central.',
      'Se juega con 5 pelotas en Cloth y 6 en Foam, todas iguales y de 17,8 cm (7 pulgadas).',
      'Cada lado tiene una fila para los jugadores eliminados y, en Cloth, un área de penalidad.',
    ],
  },
  {
    Icon: Users, title: 'Equipos y uniformes',
    items: [
      'Cada equipo anota entre 6 y 12 jugadores. Juegan 6 por set; el resto espera en el área de sustitutos.',
      'Puede tener hasta 3 alcanzapelotas por set y hasta 2 líderes (entrenador, asistente o manager) dentro del área de juego.',
      'Todos usan uniforme idéntico, con nombre y número único (de 0 a 99) atrás y número adelante.',
      'Se juega siempre con zapatillas de suela que no deje marcas. Las joyas peligrosas se quitan o se cubren con cinta.',
      'No se usan guantes salvo necesidad médica demostrada.',
    ],
  },
  {
    Icon: Timer, title: 'Tiempos y sets',
    items: [
      'El partido tiene dos tiempos de 20 minutos con 5 de descanso. En el entretiempo los equipos cambian de lado.',
      'Después de cada set, los árbitros esperan 30 segundos para que los equipos se posicionen.',
      'En Cloth el set dura 3 minutos. Si al terminar un set quedan menos de 120 segundos, se juega un set final de 90 segundos.',
      'Si hay que desempatar, se juega un set de 3 minutos en Cloth o de 4 en Foam. Si sigue empatado, el primero que elimine a un rival gana en Cloth, y en Foam deja de valer el bloqueo.',
      'Cada equipo tiene 1 tiempo muerto de 60 segundos por tiempo. En Cloth se pide al terminar un set; en Foam, en cualquier momento, cuando lo decide el árbitro principal.',
      'Con el juego detenido o en un tiempo muerto, todos los relojes se pausan.',
    ],
  },
  {
    Icon: Trophy, title: 'Puntuación',
    items: [
      'Se gana un set eliminando a todos los rivales o, en Cloth, teniendo más jugadores vivos cuando termina el tiempo del set.',
      'Ganar un set vale 2 puntos en Cloth y 1 en Foam. En Cloth, empatar un set vale 1 punto y perderlo, 0.',
      'Gana el partido el equipo con más puntos. Si hay empate y el torneo pide un ganador, se juega un set de desempate.',
      'Si un equipo abandona o recibe una tarjeta amarilla de equipo, pierde el set; con tarjeta roja de equipo, pierde el partido.',
    ],
  },
  {
    Icon: Swords, title: 'Cómo se juega',
    items: [
      'Carrera inicial: los jugadores arrancan con un pie en la línea de fondo y salen cuando suena el silbato. Salir antes es una salida en falso.',
      'Cloth: 5 pelotas sobre la línea central; cada equipo toma las 2 de su lado y la del centro se disputa. Foam: cada equipo toma 3 pelotas de su derecha.',
      'Una pelota es "viva" cuando cruzó la línea de ataque. Solo los jugadores vivos pueden lanzar.',
      'Quemado: la pelota viva toca a un jugador en cualquier parte del cuerpo, del pelo o de la ropa y después toca un objeto muerto. El jugador levanta la mano y va al final de la fila de eliminados.',
      'Catch: si atrapás una pelota viva en el aire, el que la lanzó queda eliminado y vuelve a entrar el primero de tu fila.',
      'Bloqueo: podés usar una pelota como escudo. En Cloth, de la mano a la muñeca se considera parte de la pelota.',
      'Todo lanzamiento debe ser un intento válido: la pelota tiene que caer o pasar a menos de 1 metro del rival. Si no, en Cloth el jugador queda out y en Foam recibe advertencia o queda out.',
      'Salida en falso: en Cloth el equipo cede todas las pelotas y se reinicia el set. En Foam suma una advertencia; con 2, solo pueden jugar 5 jugadores el resto del set.',
      'Ventaja: el equipo con más pelotas. En Cloth, después de 5 segundos los árbitros cantan "jueguen X pelotas" y hay que lanzar en 5 segundos más. En Foam hay 10 segundos para lanzar o se ceden las pelotas.',
    ],
  },
]

// Tarjetas y sanciones, con su color
const TARJETAS = [
  { color: '#facc15', name: 'Amarilla', txt: 'El jugador va 5 minutos de partido al área de penalidad y su equipo juega en desventaja. Solo una por partido: la siguiente infracción es roja.' },
  { color: '#3b82f6', name: 'Azul (solo Cloth)', txt: 'El jugador va a penalidad por el resto del set y todo el siguiente, y su equipo juega en desventaja. Máximo dos por partido.' },
  { color: '#ef4444', name: 'Roja', txt: 'Expulsión inmediata, el equipo queda con un jugador menos todo el partido y el jugador no juega los 2 partidos siguientes.' },
]

function Seccion({ Icon, title, items, open }) {
  return (
    <details open={open} className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={18} /></span>
        <span className="flex-1 text-[15px] font-extrabold">{title}</span>
        <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <ul className="space-y-2.5 px-4 pb-4 pl-[3.75rem] pr-4 text-sm leading-relaxed">
        {items.map((t, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-4 top-[0.55rem] h-1.5 w-1.5 rounded-full bg-accent" />
            {t}
          </li>
        ))}
      </ul>
    </details>
  )
}

export default function ReglasPage() {
  return (
    <div className="space-y-4">
      {/* Banner */}
      <section
        className="relative overflow-hidden rounded-3xl border border-line p-5"
        style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 40%, var(--surface-2)) 0%, var(--surface) 75%)' }}
      >
        <BookOpen size={120} strokeWidth={1.2} className="pointer-events-none absolute -right-5 -top-4 text-accent opacity-20" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-accent">Reglamento WDBF 2024</p>
        <h1 className="mt-1 text-3xl font-extrabold leading-tight" style={{ textShadow: 'none' }}>Reglas del juego</h1>
        <p className="mt-1 max-w-[18rem] text-sm text-muted" style={{ textShadow: 'none' }}>Todo lo que se juega en Cloth y en Foam, resumido y con el reglamento completo a un toque.</p>
        <a
          href={PDF}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-sm font-extrabold text-black"
        >
          <Download size={16} /> Reglamento completo (PDF)
        </a>
      </section>

      {/* Cloth vs Foam de un vistazo */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-[1.1fr_1fr_1fr] items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest">
          <span className="text-muted">En un vistazo</span>
          <span className="text-accent">Cloth</span>
          <span className="text-warn">Foam</span>
        </div>
        {VISTAZO.map(([k, c, f], i) => (
          <div key={k} className={'grid grid-cols-[1.1fr_1fr_1fr] gap-2 px-4 py-2.5 text-sm ' + (i ? 'border-t border-line' : '')}>
            <span className="font-bold">{k}</span>
            <span>{c}</span>
            <span>{f}</span>
          </div>
        ))}
      </section>

      {/* Secciones desplegables */}
      <div className="space-y-2.5">
        {SECCIONES.map((s, i) => <Seccion key={s.title} {...s} open={i === 0} />)}

        <details className="group rounded-2xl border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Gavel size={18} /></span>
            <span className="flex-1 text-[15px] font-extrabold">Tarjetas y sanciones</span>
            <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-2.5 px-4 pb-4">
            <p className="text-sm leading-relaxed">Los árbitros pueden dar antes una advertencia verbal si la infracción no justifica una sanción inmediata.</p>
            {TARJETAS.map((t) => (
              <div key={t.name} className="flex gap-3 rounded-xl border border-line bg-surface-2 p-3">
                <span className="mt-0.5 h-7 w-5 shrink-0 rounded-[4px]" style={{ background: t.color }} />
                <div>
                  <p className="text-sm font-extrabold">{t.name}</p>
                  <p className="text-sm leading-relaxed text-muted">{t.txt}</p>
                </div>
              </div>
            ))}
            <p className="text-sm leading-relaxed">Cuando se da una tarjeta a un equipo: la amarilla le hace perder el set y la roja, el partido. Un equipo que acumula 4 amarillas pierde el partido (una roja vale 2 amarillas). Las tarjetas no pasan al partido siguiente, salvo la suspensión de la roja. También se sanciona el lenguaje o los gestos agresivos, abusivos o discriminatorios.</p>
          </div>
        </details>
      </div>

      <p className="px-1 text-xs text-muted">
        Resumen del reglamento WDBF 2024 (traducción al español de Anile, Ayelen, Argentina). Cada torneo puede aplicar ajustes propios: ante cualquier duda, vale lo que indique la organización y el reglamento completo.
      </p>
    </div>
  )
}
