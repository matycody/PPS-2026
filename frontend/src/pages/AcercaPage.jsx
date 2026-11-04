import { Link } from 'react-router-dom'
import { ArrowUpRight, BookOpen, Info, Timer, Trophy, Target, Users } from 'lucide-react'

// lucide-react no trae logos de marcas: el de Instagram va dibujado acá
function InstagramIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  )
}

const CUENTAS = [
  { user: 'dodgeballbuenosaires', url: 'https://www.instagram.com/dodgeballbuenosaires/' },
  { user: 'dodgeball.ar', url: 'https://www.instagram.com/dodgeball.ar/' },
]

const QUE_HACE = [
  [Timer, 'Reloj de partido y de set en vivo'],
  [Trophy, 'Torneos, tablas, fixture y llaves'],
  [Users, 'Equipos, jugadores y sanciones'],
  [Target, 'Predicciones y ranking'],
]

export default function AcercaPage() {
  return (
    <div className="space-y-4">
      {/* Banner */}
      <section
        className="relative overflow-hidden rounded-3xl border border-line p-5"
        style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 40%, var(--surface-2)) 0%, var(--surface) 75%)' }}
      >
        <Info size={120} strokeWidth={1.2} className="pointer-events-none absolute -right-5 -top-4 text-accent opacity-20" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-accent">Acerca de / Contacto</p>
        <h1 className="mt-1 text-3xl font-extrabold leading-tight" style={{ textShadow: 'none' }}>Dodgeball Buenos Aires</h1>
        <p className="mt-1 max-w-[18rem] text-sm text-muted" style={{ textShadow: 'none' }}>Novedades, fechas y resultados: seguinos en las redes de la comunidad.</p>
      </section>

      {/* Contacto */}
      <section className="space-y-2.5">
        <h2 className="px-1 text-xs font-bold uppercase tracking-widest text-muted">Contacto</h2>
        {CUENTAS.map((c) => (
          <a
            key={c.user}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-3.5 active:bg-surface-2"
          >
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white"
              style={{ background: 'linear-gradient(135deg, #f58529 0%, #dd2a7b 50%, #8134af 100%)' }}
            >
              <InstagramIcon />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-extrabold">@{c.user}</span>
              <span className="block text-xs text-muted">Instagram · abrir perfil</span>
            </span>
            <ArrowUpRight size={18} className="shrink-0 text-muted" />
          </a>
        ))}
      </section>

      {/* Sobre la app */}
      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted">Sobre esta app</h2>
        <p className="text-sm leading-relaxed">
          Dodgeball BA es la web para seguir los partidos de Dodgeball Buenos Aires en vivo, desde el celular o la computadora. Para mirar no hace falta tener cuenta.
        </p>
        <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          {QUE_HACE.map(([Icon, txt]) => (
            <li key={txt} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm font-semibold">
              <Icon size={16} className="shrink-0 text-accent" />
              {txt}
            </li>
          ))}
        </ul>
        <Link to="/reglas" className="flex items-center gap-2 text-sm font-bold text-accent">
          <BookOpen size={16} /> Ver las reglas del juego
        </Link>
      </section>

      <p className="px-1 text-xs text-muted">
        Desarrollada como Práctica Profesional Supervisada de la Tecnicatura en Programación, Universidad Nacional de Guillermo Brown.
      </p>
    </div>
  )
}
