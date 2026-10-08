import { useState } from 'react'
import { ChevronUp, ChevronDown, SlidersHorizontal } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import ColorPicker from './ColorPicker'
import { useAuthStore } from '../stores/authStore'
import { ITEMS, SECTIONS, GENERAL, BOTTOM_PRIORITY, roleLabel } from '../lib/navConfig'
import { useMenuPrefs, sortKeys, availableCards } from '../stores/menuPrefsStore'

const meta = (k) => ITEMS[k] ?? GENERAL.find((g) => g.to === k)

function Head({ children }) {
  return <p className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-widest text-accent">{children}</p>
}

function Switch({ on, disabled, onClick, label }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={'relative h-7 w-12 shrink-0 rounded-full border transition-colors disabled:opacity-40 ' + (on ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2')}
    >
      <span className={'absolute top-0.5 h-5 w-5 rounded-full transition-all ' + (on ? 'left-6 bg-accent' : 'left-0.5 bg-muted')} />
    </button>
  )
}

function Arrow({ dir, disabled, onClick, label }) {
  const Icon = dir < 0 ? ChevronUp : ChevronDown
  return (
    <button aria-label={label} disabled={disabled} onClick={onClick} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 disabled:opacity-30">
      <Icon size={18} />
    </button>
  )
}

function Row({ item, children }) {
  const Icon = item.Icon
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon size={18} className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.label}</span>
      {children}
    </div>
  )
}

function Slider({ label, value, max, unit, onChange }) {
  return (
    <label className="mt-2 block text-sm">
      <span className="flex justify-between font-semibold"><span>{label}</span><span className="text-muted">{value}{unit}</span></span>
      <input type="range" min="0" max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 h-7 w-full accent-accent" />
    </label>
  )
}

function MenuPrefsBody() {
  const { user, menu } = useAuthStore()
  const uid = user?.id
  const prefs = useMenuPrefs((s) => s.byUser[uid]) ?? {}
  const look = useMenuPrefs((s) => s.look)
  const act = useMenuPrefs.getState
  if (!uid) return null
  const role = roleLabel(user, menu)

  // Barra inferior: hasta 3 accesos (Mi perfil siempre está)
  const defBottom = BOTTOM_PRIORITY.filter((k) => k !== 'home' && menu.includes(k)).slice(0, 2)
  const bottom = (prefs.bottom ?? defBottom).filter((k) => k !== 'home' && menu.includes(k)).slice(0, 2)
  const cands = menu.filter((k) => ITEMS[k] && k !== 'home' && k !== 'perfil' && !ITEMS[k].soon)
  const toggleBottom = (k) => {
    if (bottom.includes(k)) act().setBottom(uid, bottom.filter((x) => x !== k))
    else if (bottom.length < 2) act().setBottom(uid, [...bottom, k])
  }

  // Menú lateral: se reordena solo dentro de cada sección, nunca se oculta
  const sections = [
    ...SECTIONS.map((s) => ({ title: s.title, keys: s.keys.filter((k) => menu.includes(k)) })),
    { title: 'General', keys: GENERAL.map((g) => g.to) },
  ]
    .map((s) => ({ ...s, keys: sortKeys(s.keys, prefs.order?.[s.title]) }))
    .filter((s) => s.keys.length > 1)
  const move = (s, i, d) => {
    const k = [...s.keys]
    const j = i + d
    ;[k[i], k[j]] = [k[j], k[i]]
    act().setOrder(uid, s.title, k)
  }

  // Tarjetas del inicio
  const cards = availableCards(role, menu)
  const cur = prefs.cards ?? cards.map((c) => c.to)
  const toggleCard = (to) =>
    act().setCards(uid, cards.map((c) => c.to).filter((x) => (x === to ? !cur.includes(to) : cur.includes(x))))

  return (
    <div>
      <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-muted">Mi menú</h2>
      <p className="text-xs text-muted">Se guarda en este dispositivo.</p>

      <Head>Barra inferior ({bottom.length} de 2)</Head>
      <p className="text-xs text-muted">Inicio siempre va primero y Mi perfil al final.</p>
      <div className="divide-y divide-line">
        {cands.map((k) => (
          <Row key={k} item={ITEMS[k]}>
            <Switch on={bottom.includes(k)} disabled={!bottom.includes(k) && bottom.length >= 2} onClick={() => toggleBottom(k)} label={ITEMS[k].label} />
          </Row>
        ))}
      </div>

      {sections.length > 0 && (
        <>
          <Head>Orden del menú lateral</Head>
          <p className="text-xs text-muted">Cada ítem se mueve solo dentro de su sección.</p>
          {sections.map((s) => (
            <div key={s.title}>
              <p className="mb-1 mt-3 text-[11px] font-bold uppercase tracking-widest text-muted">{s.title}</p>
              <div className="divide-y divide-line">
                {s.keys.map((k, i) => (
                  <Row key={k} item={meta(k)}>
                    <Arrow dir={-1} disabled={i === 0} onClick={() => move(s, i, -1)} label={'Subir ' + meta(k).label} />
                    <Arrow dir={1} disabled={i === s.keys.length - 1} onClick={() => move(s, i, 1)} label={'Bajar ' + meta(k).label} />
                  </Row>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <Head>Tarjetas del inicio</Head>
      <div className="divide-y divide-line">
        {cards.map((c) => (
          <Row key={c.to} item={c}>
            <Switch on={cur.includes(c.to)} onClick={() => toggleCard(c.to)} label={c.label} />
          </Row>
        ))}
      </div>

      <Head>Transparencia del menú</Head>
      <Slider label="Header y barra inferior" value={look.a} max={95} unit="%" onChange={(v) => act().setLook({ a: v })} />
      <Slider label="Menú lateral" value={look.da} max={95} unit="%" onChange={(v) => act().setLook({ da: v })} />
      <Slider label="Desenfoque" value={look.b} max={30} unit="px" onChange={(v) => act().setLook({ b: v })} />

      <Head>Tema y color</Head>
      <div className="space-y-4">
        <ThemeToggle />
        <ColorPicker />
      </div>

      <button onClick={() => act().reset(uid)} className="mt-5 w-full rounded-2xl border border-line bg-surface-2 py-3 text-sm font-bold">
        Restablecer mi menú
      </button>
    </div>
  )
}
export default function MenuPrefsCard() {
  const [open, setOpen] = useState(false)
  const uid = useAuthStore((s) => s.user?.id)
  if (!uid) return null
  return (
    <section className="rounded-3xl border border-line bg-surface">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 p-5 text-left">
        <SlidersHorizontal size={20} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold">Personalización</span>
          <span className="block text-xs text-muted">Menú, tarjetas del inicio, tema y transparencia</span>
        </span>
        <ChevronDown size={20} className={'shrink-0 text-muted transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && <div className="border-t border-line px-5 pb-5 pt-4"><MenuPrefsBody /></div>}
    </section>
  )
}
