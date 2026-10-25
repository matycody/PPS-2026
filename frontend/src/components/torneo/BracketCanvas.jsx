import { useMemo } from 'react'

const GAP = 12

// Posición vertical de cada partido: centrado entre los partidos que lo alimentan;
// si no sale de ninguno (equipos directos) va apilado, sin superponerse.
export function layoutRounds(rounds) {
  const top = new Map()
  const h = new Map()
  for (const r of rounds) for (const it of r.items) h.set(it.key, it.h)
  let height = 0
  for (const r of rounds) {
    let cursor = 0
    for (const it of r.items) {
      const ys = it.feeders.filter((k) => top.has(k)).map((k) => top.get(k) + h.get(k) / 2)
      const want = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length - it.h / 2 : 0
      const y = Math.max(want, cursor)
      top.set(it.key, y)
      cursor = y + it.h + GAP
      height = Math.max(height, y + it.h)
    }
  }
  return { top, height }
}

// rounds: [{ key, title, items: [{ key, h, feeders: [key], node }] }]
export default function BracketCanvas({ rounds, colW = 240, gap = 32, footer, after }) {
  const { top, height } = useMemo(() => layoutRounds(rounds), [rounds])
  const pitch = colW + gap
  const width = rounds.length * pitch - gap

  const col = new Map()
  const item = new Map()
  rounds.forEach((r, ci) => r.items.forEach((it) => { col.set(it.key, ci); item.set(it.key, it) }))

  const links = []
  rounds.forEach((r, ci) => r.items.forEach((it) => it.feeders.forEach((fk) => {
    if (!top.has(fk)) return
    const x1 = col.get(fk) * pitch + colW
    const y1 = top.get(fk) + item.get(fk).h / 2
    const x2 = ci * pitch
    const y2 = top.get(it.key) + it.h / 2
    const xm = x2 - gap / 2
    links.push(<path key={fk + '>' + it.key} d={`M${x1} ${y1}H${xm}V${y2}H${x2}`} />)
  })))

  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-2">
      <div className="shrink-0" style={{ width }}>
        <div className="mb-2 flex">
          {rounds.map((r, ci) => (
            <p key={r.key} className="shrink-0 text-center text-xs font-bold uppercase tracking-widest text-muted" style={{ width: colW, marginRight: ci < rounds.length - 1 ? gap : 0 }}>{r.title}</p>
          ))}
        </div>
        <div className="relative" style={{ height }}>
          <svg className="absolute inset-0 stroke-white" width={width} height={height} fill="none" strokeWidth="2" aria-hidden="true">{links}</svg>
          {rounds.map((r, ci) => r.items.map((it) => (
            <div key={it.key} className="absolute" style={{ top: top.get(it.key), left: ci * pitch, width: colW, height: it.h }}>{it.node}</div>
          )))}
        </div>
        {footer && (
          <div className="mt-3 flex">
            {rounds.map((r, ci) => (
              <div key={r.key} className="shrink-0" style={{ width: colW, marginRight: ci < rounds.length - 1 ? gap : 0 }}>{footer(r)}</div>
            ))}
          </div>
        )}
      </div>
      {after && <div className="mt-6 shrink-0">{after}</div>}
    </div>
  )
}