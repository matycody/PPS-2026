import { useState } from 'react'
import { BookOpen, ChevronDown, Download, FileText, GraduationCap, Gavel, LayoutDashboard, Scale, Swords, Timer, Trophy, Users } from 'lucide-react'

// Resumen de los reglamentos WDBF 2026 (Cloth y Foam), con las adaptaciones juveniles y recreativas.
// Los PDF originales (en inglés) están en /public. Es un resumen: ante cualquier duda vale el reglamento completo.
const DOCS = {
  cloth: { label: 'Reglamento Cloth 2026', url: '/wdbf-cloth-2026.pdf' },
  foam: { label: 'Reglamento Foam 2026', url: '/wdbf-foam-2026.pdf' },
}

const ADAPTACIONES = [
  { label: 'Youth Cloth', url: '/wdbf-youth-cloth-2026.pdf' },
  { label: 'Youth Foam', url: '/wdbf-youth-foam-2026.pdf' },
  { label: 'Recreativo Cloth', url: '/wdbf-grassroots-cloth-2026.pdf' },
  { label: 'Recreativo Foam', url: '/wdbf-grassroots-foam-2026.pdf' },
]

const VISTAZO = [
  ['Pelotas', '5 (tela, 7")', '6 (espuma, 7")'],
  ['Partido', '2 tiempos de 20 min', '2 tiempos de 20 min'],
  ['Descanso', '5 min', 'Hasta 5 min'],
  ['Set', 'Hasta 3 min', 'Hasta 3 min y después No Bloqueo'],
  ['Puntos por set', '2 (empate 1, derrota 0)', '1'],
  ['Zona neutral', 'Sí, 4 m', 'No'],
  ['Ventaja / Carga', '5 s y "jueguen n pelotas"', 'Carga de 10 s'],
  ['Tiempo muerto', '1 por tiempo, 60 s, solo entre sets', '1 por tiempo, 60 s, cuando lo habilita el árbitro'],
  ['Set final', 'Menos de 120 s: set de 90 s', 'Último minuto: reloj pausado entre sets'],
  ['Desempate', 'Set de 3 min y muerte súbita', 'Set de 3 min y después No Bloqueo'],
  ['Amarilla (jugador)', '5 min', '3 min'],
  ['Tarjeta azul', 'Sí', 'No'],
  ['Roja (jugador)', 'Expulsión', 'Expulsión y 2 partidos de suspensión'],
]

const COMUN = {
  Icon: Users, title: 'Equipos y uniformes (ambas modalidades)',
  items: [
    'Cada equipo anota entre 6 y 12 jugadores. Juegan 6 por set; el resto espera fuera de la cancha.',
    'Puede tener hasta 3 alcanzapelotas por set (jugadores que no están activos) y hasta 2 líderes: entrenador, asistente o manager.',
    'Uniforme idéntico en color y diseño, con número único de 0 a 99 atrás (arriba) y adelante. El capitán debe estar identificado.',
    'Zapatillas de lona o cuero con suela de goma que no deje marcas. Joyas peligrosas: se quitan o se tapan con cinta aprobada por un oficial.',
    'Cabeza: vinchas y cascos protectores (en Foam también bandanas y prendas finas). Yesos y soportes duros se acolchan. Sin guantes salvo necesidad médica demostrada.',
    'No se pueden usar sustancias que mejoren el agarre, salvo magnesia (chalk) comercial.',
  ],
}

const MODOS = {
  cloth: {
    nombre: 'Cloth',
    secciones: [
      {
        Icon: LayoutDashboard, title: 'La cancha y las pelotas',
        items: [
          'Cancha de 18 m de largo por 9 m de ancho, con al menos 1 m libre alrededor y 4 m de altura sin obstáculos. Líneas de 5 cm.',
          'La línea de ataque está a 5,5 m de la línea central. La zona neutral mide 4 m (2 m a cada lado de la central).',
          'Sobre la línea central van 5 marcas para las pelotas, a 1,5 m entre sí.',
          'Fila de jugadores out de 4 m x 1 m y área de penalidad de 1 m x 1 m.',
          'Se juega con 5 pelotas de tela texturada con capa de espuma, de 17,78 cm (7 pulgadas) y 1,6 a 1,8 psi.',
        ],
      },
      {
        Icon: Users, title: 'Alcanzapelotas y líderes',
        items: [
          'Los alcanzapelotas pueden pasar pelotas a jugadores vivos u otros alcanzapelotas y ponerlas en cancha, pero no pueden tocar líneas, pelotas ni jugadores dentro de la cancha.',
          'No pueden recuperar una pelota que cruzó la línea central hacia afuera de su mitad.',
          'Si infringen: advertencia verbal o tarjeta amarilla de alcanzapelotas. Si la falta cambia el reparto de pelotas, el árbitro puede darle al rival hasta 5.',
          'Los líderes se quedan en la fila, el banco y el área de penalidad, y no entran a la cancha durante un set sin permiso de un oficial.',
        ],
      },
      {
        Icon: Timer, title: 'Tiempos y sets',
        items: [
          'Dos tiempos de 20 minutos con 5 de descanso; los equipos cambian de lado. Si no se ponen de acuerdo en el lado inicial, se sortea con una moneda.',
          'El set dura hasta 3 minutos y termina cuando se agota el tiempo o cuando un equipo queda sin jugadores.',
          'Entre sets hay 30 segundos para reubicarse. Si un equipo no está listo, puede recibir advertencia verbal o tarjeta amarilla de equipo.',
          'Si un set termina con menos de 120 segundos en el reloj del partido, se juega un set final de 90 segundos (se reinicia ante una salida en falso) y la mitad termina ahí.',
          'Desempate: set de 3 minutos; si sigue igual, "muerte súbita" y gana el set el primero que elimine a un rival.',
          'Tiempo muerto: 1 por tiempo, de 60 segundos. Lo pide un líder después de terminar un set y antes de que se alinee.',
          'Cuando el árbitro suspende el juego, todos los relojes se pausan.',
        ],
      },
      {
        Icon: Trophy, title: 'Puntuación',
        items: [
          'Se gana un set eliminando a todos los rivales o teniendo más jugadores vivos o ingresantes cuando se acaba el tiempo del set.',
          'Ganar un set da 2 puntos, empatarlo da 1 y perderlo, 0. Hay empate si ambos tienen igual cantidad de jugadores o si una jugada simultánea deja a los dos sin jugadores.',
          'Gana el partido quien suma más puntos. Si el torneo exige un ganador, se juega un set de desempate.',
          'Abandono de un set: lo gana el rival. Abandono del partido: lo gana el rival.',
          'Equipo que no se presenta a la hora: pierde un set y se esperan 3 minutos más; si sigue sin estar, pierde el partido.',
        ],
      },
      {
        Icon: Swords, title: 'Cómo se juega',
        items: [
          'Carrera inicial: los jugadores arrancan con un pie en la línea de fondo y salen con el silbato. Cada equipo toma las 2 pelotas de su lado (las más a la izquierda) y la del centro se disputa. No se puede deslizarse ni tirarse de cabeza, y no se permite contacto: quien lo cause queda out.',
          'Una pelota recuperada en la carrera se activa cuando cruza por completo la línea de ataque. Antes puede atraparse pero no elimina.',
          'Salida en falso (perder contacto con la línea de fondo después de "equipo listo" y antes del silbato): el equipo cede todas las pelotas y se reinicia. Si fue de ambos a la vez, se repite el set.',
          'Out: la pelota viva te pega en cualquier parte del cuerpo, del pelo o de la ropa; quedás out cuando dejás de tocarla. El jugador saliente levanta la mano, sale por la línea más cercana y va al final de la fila.',
          'Atrapada: si atrapás una pelota viva, el que la lanzó queda out y vuelve el primero de tu fila. No podés ayudarte con la ropa.',
          'Bloqueo: podés usar una o más pelotas. De la mano a la muñeca cuenta como parte de la pelota. Si el golpe te desarma, tenés que recuperar el control antes de que toque un objeto muerto u otro jugador, o quedás out.',
          'Intento válido: todo lanzamiento debe caer o pasar a menos de 1 metro del rival. Si no, el jugador queda out. Dejar una pelota en la zona neutral también es un intento inválido.',
          'Ventaja: el equipo con más pelotas tiene 5 segundos; después los árbitros cantan "jueguen n pelotas" y hay 5 segundos para hacer esos intentos. Quien no los haga, queda out.',
          'Zona neutral: no se permite contacto físico; el que lo inicia queda out.',
          'Jugada de sacrificio: un jugador puede atacar en el aire cruzando la línea de zona neutral rival. Solo 1 por equipo a la vez. Si no elimina a nadie, queda out; si elimina, vuelve a la zona neutral sin pisar afuera.',
          'Fuera de límites: tocar una línea límite, el territorio rival o la línea de zona neutral rival deja out de inmediato.',
          'Jugada simultánea: se resuelven todos los resultados a la vez; si quedan sin jugadores los dos, el set es empate.',
        ],
      },
    ],
    tarjetas: [
      { color: '#facc15', name: 'Amarilla de jugador', txt: 'Va al área de penalidad 5 minutos de tiempo de partido. Solo una por partido: la siguiente falta se sanciona con roja.' },
      { color: '#3b82f6', name: 'Azul', txt: 'Penalidad por el resto del set y todo el siguiente; el equipo juega en desventaja. Máximo dos por jugador y partido; la tercera es amarilla.' },
      { color: '#ef4444', name: 'Roja de jugador', txt: 'Expulsión inmediata y el equipo juega con uno menos el resto del partido.' },
    ],
    equipoTxt: 'Tarjeta amarilla de equipo: el equipo pierde el set (si se da entre sets o terminado el partido, pierde un set completo). Solo una por partido; la siguiente es roja. Roja de equipo: pierde el partido. Si un equipo o sus participantes acumulan 4 amarillas, pierde el partido (una roja vale 2 amarillas).',
    extra: [
      'Desafíos: 2 por partido, solo para una mala aplicación de una regla (no para decisiones de criterio), y solo los pide un líder o el capitán, enseguida o antes del siguiente set.',
      'Lesiones: se suspende el juego y se puede sustituir al lesionado. Con sangre, el jugador sale del set hasta que no haya sangre visible en él ni en su ropa.',
    ],
  },
  foam: {
    nombre: 'Foam',
    secciones: [
      {
        Icon: LayoutDashboard, title: 'La cancha y las pelotas',
        items: [
          'Cancha de 18 m de largo por 9 m de ancho, con al menos 1 m libre alrededor y 4 m de altura sin obstáculos. Líneas de 5 cm. No hay zona neutral.',
          'La línea de activación está a 3 m de la línea central, en el lado de cada equipo.',
          'La fila de jugadores out y el área de penalidad (1 m x 1 m) están junto al banco de equipo, que queda a 4 m o más de la línea central.',
          'Se juega con 6 pelotas de espuma con revestimiento de poliuretano, de 17,8 cm (7 pulgadas) y entre 134 y 146 g.',
          'En competencias femeninas, la línea de fondo se adelanta 1 m hacia el centro.',
        ],
      },
      {
        Icon: Users, title: 'Alcanzapelotas y líderes',
        items: [
          'Los alcanzapelotas no pueden tocar líneas, pelotas ni jugadores dentro de la cancha, ni retirar pelotas que están sobre las líneas. No pueden recuperar una pelota que cruzó la central hacia afuera de su mitad.',
          'Primera falta: advertencia verbal. Otra falta del mismo alcanzapelotas: queda relevado el resto del partido y lo reemplaza otro.',
          'Los líderes pueden moverse entre la línea de activación y la de fondo de su equipo, y cruzarla para hablar con un oficial (consulta o desafío).',
          'Los árbitros de esquina ayudan con límites, líneas y estado de la pelota, pero no dan la señal de inicio ni deciden desafíos.',
        ],
      },
      {
        Icon: Timer, title: 'Tiempos y sets',
        items: [
          'Dos tiempos de 20 minutos con un entretiempo de hasta 5. Ambos equipos tienen que estar en cancha 5 minutos antes del inicio.',
          'El set dura hasta 3 minutos de juego regular; si no se definió, se declara No Bloqueo en la primera pausa del juego.',
          'Entre sets hay 30 segundos para reubicarse. Si un equipo no está listo: advertencia verbal la primera vez en una mitad y tarjeta amarilla de equipo la segunda.',
          'Si un set termina con 1:00 o menos en el reloj de la mitad, el reloj se pausa hasta el inicio del siguiente. Si quedan 5 segundos o menos, el set siguiente arranca enseguida y en No Bloqueo.',
          'Si el reloj de la mitad llega a 0:00 con un set en juego, el set sigue hasta definirse; en la primera pausa se reparten 3 pelotas por lado y se declara No Bloqueo.',
          'Las pelotas lanzadas antes de que el reloj llegue a 0:00 siguen vivas hasta resolverse. Después de 0:00 nadie puede iniciar un lanzamiento.',
          'Tiempo muerto: 1 por tiempo, de 60 segundos. Un líder lo pide en cualquier momento y el árbitro principal decide cuándo empieza. Con el juego suspendido, los relojes se pausan.',
          'Desempate: set de hasta 3 minutos y después No Bloqueo hasta que alguien gane el set.',
        ],
      },
      {
        Icon: Trophy, title: 'Puntuación',
        items: [
          'Cada set ganado vale 1 punto. Se gana un set cuando el rival se queda con cero jugadores vivos y vos con al menos uno.',
          'Gana el partido quien tiene más puntos al terminar el tiempo. Si hay empate, se juega un set de desempate.',
          'Abandono de un set o del partido: lo gana el rival. Para la tabla de posiciones, un abandono se registra con puntaje de escala 12: no presentación 12-0; si se abandona jugando, el rival suma hasta 12 sets y se conservan los que ya hizo el que abandona (12-B).',
          'Si un equipo es retirado de un formato (todos contra todos o playoffs), sus partidos pendientes se registran 12-0 para el rival. Esto es solo para posiciones y no cambia sanciones.',
        ],
      },
      {
        Icon: Swords, title: 'Cómo se juega',
        items: [
          'Carrera inicial: 6 pelotas sobre la línea central. Cada equipo tiene 3 designadas (las de su derecha) y no puede tomar las del rival hasta activar las 3. Se puede pisar o cruzar la central solo mientras se recuperan pelotas.',
          'Posición de salida: al menos un pie en la línea de fondo y nada del cuerpo fuera de las líneas límite. La señal de inicio se da dentro de los 2 segundos de confirmar que ambos equipos están listos.',
          'Activación: las pelotas de la carrera se activan al cruzar la línea de activación propia; antes no eliminan ni pueden atraparse.',
          'Salida en falso: advertencia al equipo. En las siguientes de esa mitad, el jugador infractor empieza el set en la fila como jugador out. Las advertencias se reinician cada mitad.',
          'Out: la pelota viva te toca en el cuerpo, pelo, uniforme o equipo y después se vuelve muerta al tocar un objeto muerto. También quedás out si tocás una línea o el piso fuera de tu territorio.',
          'Trampa: si la pelota toca al jugador y al piso a la vez, no es atrapada: la pelota queda muerta y el jugador out.',
          'Atrapada válida: control de la pelota y al menos un punto de contacto dentro de tu territorio. El que lanzó queda out y reingresa el primero de tu fila. Con la ropa no vale.',
          'Bloqueo: una pelota que bloquea sigue siendo parte del juego. Si te desarman, el equipo puede recuperar el control antes de que toque un objeto muerto; si no, quedás out.',
          'Intento válido: un esfuerzo real de golpear a un rival. Lanzar a un espacio vacío, rodar o tirar suave para evitar jugar es inválido. Se avisa una vez; después queda out el jugador; luego además se cede una pelota por jugador; luego se suma tarjeta amarilla de equipo.',
          'Jugador saliente: sale por la línea más cercana y se ubica al final de la fila. No puede tocar ni tapar pelotas ni estorbar. Primera vez: advertencia; segunda: el equipo cede una pelota; si es grave o repetido, amarilla.',
          'Reingreso: entra por la línea de fondo en el orden en que quedó out y es jugador vivo al apoyar el primer punto. No puede tocar pelotas antes de eso. Si demora a propósito (unos 5 segundos), queda out.',
        ],
      },
      {
        Icon: Scale, title: 'Foam: Carga, No Bloqueo y Wash',
        items: [
          'Carga: un equipo a la vez tiene 10 segundos para hacer un intento válido. Se asigna a quien tiene más pelotas; si hay empate, al que tiene más jugadores vivos; después al que no lanzó último; después al que va ganando; y por último, al que ganó el último set.',
          'A los 5 segundos los árbitros cuentan en voz alta los 5 restantes. Si se agota, el equipo cede las pelotas que controla, todos vuelven a la línea de fondo y se reanuda con todas las pelotas vivas y sin carrera inicial.',
          'Manipulación deliberada: mover o dejar una pelota solo para pasar la Carga cuenta como intento inválido; si es repetida o grave, puede ser amarilla.',
          'Pausa de la Carga: solo la decide el árbitro principal (pelota fuera del área, pelota rota, suspensión por seguridad) y nunca para favorecer a quien causó el problema.',
          'No Bloqueo: se activa cuando termina un set sin definirse o la mitad con un set en juego. Una pelota en control de un jugador cuenta como parte de su cuerpo: si el rival la toca, es golpe. Se salva si alguien de su equipo atrapa esa pelota antes de que se vuelva muerta.',
          'Wash: si una eliminación simultánea deja en cero a los dos equipos, no hay punto, se anula esa eliminación, los jugadores siguen vivos y el set continúa sin reinicio de pelotas.',
        ],
      },
    ],
    tarjetas: [
      { color: '#facc15', name: 'Amarilla de jugador', txt: 'Va al área de penalidad 3 minutos de tiempo activo (no cuenta en tiempos muertos ni detenciones; si termina la mitad, sigue en la siguiente). Solo una por partido: la siguiente falta es roja.' },
      { color: '#ef4444', name: 'Roja de jugador', txt: 'Expulsión inmediata, el equipo juega con uno menos el resto del partido y el jugador queda suspendido los 2 partidos siguientes de su equipo.' },
    ],
    equipoTxt: 'Tarjeta amarilla de equipo: el equipo pierde el set en juego (entre sets o terminado el partido, el siguiente set). Pueden darse varias y no se convierten en roja de equipo. Roja de equipo: solo por falta grave (pelea, abuso discriminatorio, dejar el banco para enfrentarse, negarse a cumplir tras una amarilla, riesgo para la seguridad) y hace perder el partido. Acumular amarillas no hace perder el partido. Las tarjetas se arrastran dentro de todos contra todos y de playoffs, y las suspensiones por roja pasan de una etapa a la otra.',
    extra: [
      'Desafíos: hasta 2 fallidos por partido (los exitosos no cuentan), solo para una mala aplicación de una regla escrita y solo los pide un líder. Nunca para decisiones de criterio: si te golpearon, si hubo control, si fue simultáneo o si algo fue intencional.',
      'Lesiones: se detiene el juego y se puede sustituir al lesionado por un jugador que no empezó el set; el sustituto entra al final de la fila. Con sangre, el participante sale del set aunque lo traten y puede volver en un set posterior sin sangre visible.',
    ],
  },
}

const JUVENIL = [
  'Categorías WDBF: U11, U13, U15, U18 y adultos, según la edad en el evento. No se puede jugar en categorías que estén 2 por encima de la propia. Las federaciones pueden ajustar el corte de edad.',
  'Cancha de 16 m x 9 m en U11, U13 y U15. En Cloth también se permiten 16 x 9 con zona neutral reducida de 2 m o 14 x 9 sin zona neutral; en Foam, 14 x 9.',
  'Pelotas: Foam, 4 de espuma tamaño 1 (6") en U11 a U15, con mayoría de 3. Cloth: 3 de espuma tamaño 1 en U11 y 5 de tela tamaño 2 (6,5") en U13 y U15.',
  'Tiempos: sets de hasta 2 minutos (3 en U18). Partidos de 2 mitades de 10 min (U13), 12 min (U15) y 15 min (U18); U11 juega mitades de 3 sets en Foam y de 4 en Cloth.',
  'Siempre debe haber al menos un líder adulto. Si no hay otro adulto que lo reemplace, el equipo pierde el partido.',
  'U11: el golpe en la cara no elimina (salvo que el jugador esté agachado y en movimiento); la amarilla dura lo que queda del set más 2 sets. En Cloth, la salida en falso tiene una advertencia por mitad antes de ceder las pelotas.',
  'Cloth U11 a U15: una advertencia por partido por intento inválido (si no es antideportivo) y la jugada de sacrificio deja out al jugador aunque salga bien.',
  'Foam U11 a U15: el No Bloqueo dura 1 minuto y, si sigue el empate después de 2 minutos de "gana la próxima eliminación", el set es empate con 1 punto para cada uno.',
]

const RECREATIVO = [
  'Cancha de 15 a 18 m de largo (Foam) o 14 a 18 m (Cloth, con o sin zona neutral).',
  'Se pueden usar pelotas de espuma tamaño 1 (6") y los uniformes no tienen que ser iguales.',
  'Sin alcanzapelotas designados: un jugador activo levanta la mano, sale a buscar la pelota y no puede jugar ni ser eliminado hasta volver por la línea de fondo.',
  'Los partidos pueden ser por cantidad de sets (por ejemplo, 2 mitades de 5 o 6 sets) en vez de reloj corrido.',
  'Los jugadores eliminados no salen: el rival suma un punto y gana el set quien tenga más puntos. El golpe en la cara no elimina.',
  'Foam: el No Bloqueo puede limitarse a 1 minuto y desempatar con "gana la próxima eliminación" o con set empatado de 1 punto cada uno.',
  'Cloth: solo se sanciona un intento inválido si el árbitro cree que erró a propósito, y la jugada de sacrificio deja out al jugador.',
]

function Lista({ items }) {
  return (
    <ul className="space-y-2.5 px-4 pb-4 pl-[3.75rem] pr-4 text-sm leading-relaxed">
      {items.map((t, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-4 top-[0.55rem] h-1.5 w-1.5 rounded-full bg-accent" />
          {t}
        </li>
      ))}
    </ul>
  )
}

function Seccion({ Icon, title, items, open, children }) {
  return (
    <details open={open} className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={18} /></span>
        <span className="flex-1 text-[15px] font-extrabold">{title}</span>
        <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      {items ? <Lista items={items} /> : <div className="space-y-2.5 px-4 pb-4">{children}</div>}
    </details>
  )
}

function leerModo() {
  try {
    const v = localStorage.getItem('reglas-modo')
    return v === 'foam' ? 'foam' : 'cloth'
  } catch {
    return 'cloth'
  }
}

export default function ReglasPage() {
  const [modo, setModo] = useState(leerModo)
  const m = MODOS[modo]
  const elegir = (v) => {
    setModo(v)
    try { localStorage.setItem('reglas-modo', v) } catch { /* sin almacenamiento */ }
  }

  return (
    <div className="space-y-4">
      {/* Banner */}
      <section
        className="relative overflow-hidden rounded-3xl border border-line p-5"
        style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 40%, var(--surface-2)) 0%, var(--surface) 75%)' }}
      >
        <BookOpen size={120} strokeWidth={1.2} className="pointer-events-none absolute -right-5 -top-4 text-accent opacity-20" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-accent">Reglamento WDBF 2026</p>
        <h1 className="mt-1 text-3xl font-extrabold leading-tight" style={{ textShadow: 'none' }}>Reglas del juego</h1>
        <p className="mt-1 max-w-[18rem] text-sm text-muted" style={{ textShadow: 'none' }}>Elegí la modalidad y mirá sus reglas resumidas, con el reglamento completo a un toque.</p>
        <a
          href={DOCS[modo].url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-accent px-4 py-2.5 text-sm font-extrabold text-black"
        >
          <Download size={16} /> {DOCS[modo].label} (PDF)
        </a>
      </section>

      {/* Selector de modalidad */}
      <div role="tablist" aria-label="Modalidad" className="grid grid-cols-2 gap-1.5 rounded-2xl border border-line bg-surface p-1.5">
        {Object.entries(MODOS).map(([k, v]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={modo === k}
            onClick={() => elegir(k)}
            className={'rounded-xl py-2.5 text-sm font-extrabold ' + (modo === k ? 'bg-accent text-black' : 'text-muted')}
          >
            {v.nombre}
          </button>
        ))}
      </div>

      {/* Cloth vs Foam de un vistazo */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-[1.1fr_1fr_1fr] items-center gap-2 border-b border-line bg-surface-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest">
          <span className="text-muted">En un vistazo</span>
          <span className={modo === 'cloth' ? 'text-accent' : 'text-muted'}>Cloth</span>
          <span className={modo === 'foam' ? 'text-warn' : 'text-muted'}>Foam</span>
        </div>
        {VISTAZO.map(([k, c, f], i) => (
          <div key={k} className={'grid grid-cols-[1.1fr_1fr_1fr] gap-2 px-4 py-2.5 text-sm ' + (i ? 'border-t border-line' : '')}>
            <span className="font-bold">{k}</span>
            <span className={modo === 'cloth' ? '' : 'text-muted'}>{c}</span>
            <span className={modo === 'foam' ? '' : 'text-muted'}>{f}</span>
          </div>
        ))}
      </section>

      {/* Secciones de la modalidad elegida */}
      <div className="space-y-2.5" key={modo}>
        {m.secciones.map((s, i) => <Seccion key={s.title} {...s} open={i === 0} />)}
        <Seccion {...COMUN} />

        <Seccion Icon={Gavel} title="Tarjetas y sanciones">
          <p className="text-sm leading-relaxed">Los árbitros pueden dar antes una advertencia verbal si la infracción no justifica una sanción inmediata.</p>
          {m.tarjetas.map((t) => (
            <div key={t.name} className="flex gap-3 rounded-xl border border-line bg-surface-2 p-3">
              <span className="mt-0.5 h-7 w-5 shrink-0 rounded-[4px]" style={{ background: t.color }} />
              <div>
                <p className="text-sm font-extrabold">{t.name}</p>
                <p className="text-sm leading-relaxed text-muted">{t.txt}</p>
              </div>
            </div>
          ))}
          <p className="text-sm leading-relaxed">{m.equipoTxt}</p>
          <p className="text-sm leading-relaxed">También se sanciona el lenguaje o los gestos agresivos, abusivos o discriminatorios, las burlas, tirarle a un rival que ya quedó out, hacer trampa y las demoras injustificadas.</p>
        </Seccion>

        <Seccion Icon={Scale} title="Desafíos y lesiones" items={m.extra} />
      </div>

      {/* Juveniles y recreativas (comunes a ambas modalidades) */}
      <div className="space-y-2.5">
        <h2 className="px-1 pt-2 text-xs font-bold uppercase tracking-widest text-muted">Categorías juveniles y recreativas</h2>
        <Seccion Icon={GraduationCap} title="Adaptaciones juveniles (U11 a U18)" items={JUVENIL} />
        <Seccion Icon={Users} title="Adaptaciones recreativas (grassroots)" items={RECREATIVO} />
      </div>

      {/* Documentos */}
      <section className="space-y-2.5 rounded-2xl border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted"><FileText size={14} /> Documentos oficiales (PDF, en inglés)</h2>
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          {[DOCS.cloth, DOCS.foam, ...ADAPTACIONES].map((d) => (
            <a
              key={d.url}
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm font-semibold active:bg-surface"
            >
              <Download size={15} className="shrink-0 text-accent" /> {d.label}
            </a>
          ))}
        </div>
      </section>

      <p className="px-1 text-xs text-muted">
        Resumen de los reglamentos WDBF 2026 (Cloth y Foam) y sus adaptaciones juveniles y recreativas. Cada torneo puede aplicar ajustes propios: ante cualquier duda, vale lo que indique la organización y el reglamento completo.
      </p>
    </div>
  )
}
