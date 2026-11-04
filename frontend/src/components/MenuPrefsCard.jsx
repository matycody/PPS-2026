import { useState } from 'react'
import { ChevronUp, ChevronDown, SlidersHorizontal } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import ColorPicker from './ColorPicker'
import { useAuthStore } from '../stores/authStore'
import { ITEMS, SECTIONS, GENERAL, generalFor } from '../lib/navConfig'
import { useMenuPrefs, sortKeys } from '../stores/menuPrefsStore'

const meta = (k) => ITEMS[k] ?? GENERAL.find((g) => g.to === k)

function Head({ children }) {
  return <p className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-widest text-accent">{children}</p>
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

function MenuPrefsBody() {
  const { user, menu } = useAuthStore()
  const uid = user?.id
  const prefs = useMenuPrefs((s) => s.byUser[uid]) ?? {}
  const act = useMenuPrefs.getState
  if (!uid) return null

  // Menú lateral: se reordena solo dentro de cada sección, nunca se oculta
  const sections = [
    ...SECTIONS.map((s) => ({ title: s.title, keys: s.keys.filter((k) => menu.includes(k)) })),
    { title: 'General', keys: generalFor(menu).map((g) => g.to) },
  ]
    .map((s) => ({ ...s, keys: sortKeys(s.keys, prefs.order?.[s.title]) }))
    .filter((s) => s.keys.length > 1)
  const move = (s, i, d) => {
    const k = [...s.keys]
    const j = i + d
    ;[k[i], k[j]] = [k[j], k[i]]
    act().setOrder(uid, s.title, k)
  }

  return (
    <div>
      <h2 className="mb-1 text-xs font-bold uppercase tracking-widest text-muted">Mi menú</h2>
      <p className="text-xs text-muted">Se guarda en este dispositivo.</p>

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
          <span className="block text-xs text-muted">Orden del menú, tema y color</span>
        </span>
        <ChevronDown size={20} className={'shrink-0 text-muted transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && <div className="border-t border-line px-5 pb-5 pt-4"><MenuPrefsBody /></div>}
    </section>
  )
}
