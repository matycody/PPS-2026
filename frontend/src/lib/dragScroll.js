// Deslizar con el mouse en PC: las tiras con scroll horizontal (chips, pestañas, llaves, tablas) se arrastran
// con el mouse y, si no muestran barra, también con la rueda. En celular sigue el deslizamiento táctil normal.
const THRESHOLD = 5

function scroller(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth <= n.clientWidth + 1) continue
    const st = getComputedStyle(n)
    if (st.overflowX === 'auto' || st.overflowX === 'scroll') return n
  }
  return null
}

export function installDragScroll() {
  if (typeof window === 'undefined' || window.__dragScroll) return
  window.__dragScroll = true
  let drag = null // { el, x, left, moved }
  let swallow = false

  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    if (e.target.closest('input, textarea, select, [data-nodrag]')) return
    const el = scroller(e.target)
    if (el) drag = { el, x: e.clientX, left: el.scrollLeft, moved: false }
  })

  document.addEventListener('pointermove', (e) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    if (!drag.moved && Math.abs(dx) < THRESHOLD) return
    if (!drag.moved) { drag.moved = true; drag.el.style.cursor = 'grabbing'; document.body.style.userSelect = 'none' }
    drag.el.scrollLeft = drag.left - dx
  })

  const end = () => {
    if (!drag) return
    if (drag.moved) { swallow = true; setTimeout(() => { swallow = false }, 0) } // el arrastre no cuenta como clic
    drag.el.style.cursor = ''
    document.body.style.userSelect = ''
    drag = null
  }
  document.addEventListener('pointerup', end)
  document.addEventListener('pointercancel', end)
  document.addEventListener('click', (e) => { if (swallow) { e.preventDefault(); e.stopPropagation() } }, true)
  document.addEventListener('dragstart', (e) => { if (drag) e.preventDefault() })

  // Rueda sobre una tira sin barra visible: se mueve de costado (si ya llegó al final, sigue la página)
  document.addEventListener('wheel', (e) => {
    if (e.deltaX !== 0 || e.ctrlKey || !e.deltaY) return
    const el = scroller(e.target)
    if (!el || getComputedStyle(el).scrollbarWidth !== 'none') return
    const max = el.scrollWidth - el.clientWidth
    const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY))
    if (next === el.scrollLeft) return
    el.scrollLeft = next
    e.preventDefault()
  }, { passive: false })
}
