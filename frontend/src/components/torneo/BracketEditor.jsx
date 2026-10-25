import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { Btn, inputCls } from '../ui'
import BracketCanvas from './BracketCanvas'

const NAMES = ['Final', 'Semifinales', 'Cuartos de final', 'Octavos de final', '16avos de final', '32avos de final']
const roundName = (round, max) => NAMES[max - round] ?? 'Ronda ' + round

// Cuadro vacío: `size` partidos en la primera ronda, la mitad en la siguiente, hasta la final
export function emptyBracket(size, thirdPlace) {
  const matches = []
  let n = size
  let round = 1
  let prev = []
  while (n >= 1) {
    const cur = []
    for (let i = 0; i < n; i++) {
      const ref = 'r' + round + 's' + (i + 1)
      matches.push({
        ref, round, slot: i + 1,
        a: prev.length ? { winnerOf: prev[i * 2] } : null,
        b: prev.length ? { winnerOf: prev[i * 2 + 1] } : null,
      })
      cur.push(ref)
    }
    prev = cur
    if (n === 1) break
    n = Math.ceil(n / 2)
    round++
  }
  if (thirdPlace && round >= 2) {
    const semis = matches.filter((m) => m.round === round - 1)
    if (semis.length === 2) matches.push({ ref: 'third', round, slot: 2, a: { loserOf: semis[0].ref }, b: { loserOf: semis[1].ref } })
  }
  return matches
}

// Pasa la llave que devuelve el backend al formato editable
export function fromView(view) {
  const out = []
  for (const r of view.rounds) {
    for (const m of r.matches) {
      const side = (f, team, from) => (f ? { [f.kind === 'LOSER' ? 'loserOf' : 'winnerOf']: f.matchId } : team ? { teamId: team.id, ...(from ? { from: { stageId: from.stageId, position: from.position } } : {}) } : null)
      out.push({ ref: m.id, round: r.round, slot: m.slot, a: side(m.feeds.A, m.teamA, m.fromA), b: side(m.feeds.B, m.teamB, m.fromB), scheduledAt: m.scheduledAt, court: m.court })
    }
  }
  return out
}

// Numeración corrida por ronda (1, 2, 3…) sin saltos; los cruces se enlazan por ref, no por número
const renumber = (all) => {
  const next = new Map()
  const count = {}
  all.slice().sort((x, y) => x.round - y.round || x.slot - y.slot).forEach((m) => {
    count[m.round] = (count[m.round] ?? 0) + 1
    next.set(m.ref, count[m.round])
  })
  return all.map((m) => (m.slot === next.get(m.ref) ? m : { ...m, slot: next.get(m.ref) }))
}

const keyOf = (s) => (!s ? '' : s.teamId ? 't:' + s.teamId : s.winnerOf ? 'w:' + s.winnerOf : 'l:' + s.loserOf)
const parse = (v, posOf) => {
  if (!v) return null
  if (v[0] === 'w') return { winnerOf: v.slice(2) }
  if (v[0] === 'l') return { loserOf: v.slice(2) }
  const id = v.slice(2)
  const from = posOf.get(id)
  return from ? { teamId: id, from } : { teamId: id }
}

export default function BracketEditor({ t, stage, initial, onSaved, onCancel, setErr, create = false }) {
  const [matches, setMatches] = useState(() => renumber(initial))
  const [zones, setZones] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('GET', '/tournaments/' + t.id + '/standings').then((d) => setZones(d.stages ?? [])).catch(() => {})
  }, [t.id])

  const teams = useMemo(() => t.teams.map((x) => x.team), [t.teams])
  const maxRound = matches.reduce((n, m) => Math.max(n, m.round), 1)
  const rounds = Array.from({ length: maxRound }, (_, i) => i + 1)
  const byRound = (r) => matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot)
  const label = (m) => roundName(m.round, maxRound) + ' ' + m.slot

  // Equipos por tabla de posiciones; los que no estén en ninguna zona van aparte
  const ranked = useMemo(() => {
    const seen = new Set()
    const groups = zones.map((z) => ({
      name: z.name,
      rows: z.rows.map((r, i) => { seen.add(r.team.id); return { id: r.team.id, text: (i + 1) + '° ' + z.name + ' · ' + r.team.name } }),
    })).filter((g) => g.rows.length)
    const rest = teams.filter((x) => !seen.has(x.id)).map((x) => ({ id: x.id, text: x.name }))
    return { groups, rest }
  }, [zones, teams])

  // De qué lugar de qué zona es cada equipo hoy (se guarda con el cruce para mostrar "2° Zona A")
  const posOf = useMemo(() => {
    const m = new Map()
    zones.forEach((z) => z.rows.forEach((r, i) => { if (!m.has(r.team.id)) m.set(r.team.id, { stageId: z.id, position: i + 1 }) }))
    return m
  }, [zones])

  const used = useMemo(() => {
    const u = { team: new Set(), winner: new Set(), loser: new Set() }
    for (const m of matches) for (const s of [m.a, m.b]) {
      if (s?.teamId) u.team.add(s.teamId)
      if (s?.winnerOf) u.winner.add(s.winnerOf)
      if (s?.loserOf) u.loser.add(s.loserOf)
    }
    return u
  }, [matches])

  const setSide = (ref, side, value) => setMatches((a) => a.map((m) => (m.ref === ref ? { ...m, [side]: parse(value, posOf) } : m)))

  function addMatch(round) {
    setMatches((a) => {
      const slot = Math.max(0, ...a.filter((m) => m.round === round).map((m) => m.slot)) + 1
      return [...a, { ref: 'n' + Math.random().toString(36).slice(2, 8), round, slot, a: null, b: null }]
    })
  }
  function addRound() { addMatch(maxRound + 1) }

  function removeMatch(ref) {
    setMatches((a) => renumber(a
      .filter((m) => m.ref !== ref)
      .map((m) => {
        const clean = (s) => (s && (s.winnerOf === ref || s.loserOf === ref) ? null : s)
        return { ...m, a: clean(m.a), b: clean(m.b) }
      })))
  }

  // Cruces 1.º vs último según la tabla, en los lugares libres de la primera ronda
  function autofill() {
    const order = []
    const maxLen = Math.max(0, ...zones.map((z) => z.rows.length))
    for (let i = 0; i < maxLen; i++) for (const z of zones) if (z.rows[i]) order.push(z.rows[i].team.id)
    for (const x of teams) if (!order.includes(x.id)) order.push(x.id)
    const first = byRound(1)
    const free = first.reduce((n, m) => n + (m.a?.winnerOf ? 0 : 1) + (m.b?.winnerOf ? 0 : 1), 0)
    const seeds = order.slice(0, free)
    const k = first.length
    setMatches((all) => all.map((m) => {
      if (m.round !== 1) return m
      const i = first.findIndex((x) => x.ref === m.ref)
      const a = seeds[i]
      const b = seeds[2 * k - 1 - i]
      const slot = (id) => (id ? { teamId: id, ...(posOf.get(id) ? { from: posOf.get(id) } : {}) } : null)
      return { ...m, a: slot(a), b: slot(b) }
    }))
  }

  async function save() {
    setBusy(true); setErr('')
    try {
      const body = { matches: rounds.flatMap((r) => byRound(r).map((m, i) => ({
        ref: m.ref, round: m.round, slot: i + 1, a: m.a, b: m.b,
        ...(m.scheduledAt ? { scheduledAt: m.scheduledAt } : {}),
        ...(m.court ? { court: m.court } : {}),
      }))) }
      await api('PUT', '/tournaments/' + t.id + '/stages/' + stage.id + '/bracket', body)
      onSaved()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  function sideSelect(m, side) {
    const cur = m[side]
    const curKey = keyOf(cur)
    const prevMatches = matches.filter((x) => x.round < m.round)
    const usedByOther = (id) => used.team.has(id) && curKey !== 't:' + id
    return (
      <select className="w-full rounded-lg border border-line bg-bg px-2 py-2 text-sm" value={curKey} onChange={(e) => setSide(m.ref, side, e.target.value)}>
        <option value="">— A definir —</option>
        {ranked.groups.map((g) => (
          <optgroup key={g.name} label={'Tabla · ' + g.name}>
            {g.rows.map((r) => <option key={r.id} value={'t:' + r.id} disabled={usedByOther(r.id)}>{r.text}{usedByOther(r.id) ? ' (ya está)' : ''}</option>)}
          </optgroup>
        ))}
        {ranked.rest.length > 0 && (
          <optgroup label="Otros equipos">
            {ranked.rest.map((r) => <option key={r.id} value={'t:' + r.id} disabled={usedByOther(r.id)}>{r.text}{usedByOther(r.id) ? ' (ya está)' : ''}</option>)}
          </optgroup>
        )}
        {prevMatches.length > 0 && (
          <optgroup label="Sale de un partido anterior">
            {prevMatches.map((x) => (
              <option key={'w' + x.ref} value={'w:' + x.ref} disabled={used.winner.has(x.ref) && curKey !== 'w:' + x.ref}>Ganador de {label(x)}</option>
            ))}
            {prevMatches.map((x) => (
              <option key={'l' + x.ref} value={'l:' + x.ref} disabled={used.loser.has(x.ref) && curKey !== 'l:' + x.ref}>Perdedor de {label(x)}</option>
            ))}
          </optgroup>
        )}
      </select>
    )
  }

  return (
    <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <div>
        <p className="text-sm font-bold">{create ? 'Definir los Playoffs' : 'Editar cruces'}</p>
        <p className="text-xs text-muted">
          Elegí en cada lugar un equipo o de qué partido sale. Podés poner al 1.º en cuartos y al último en la final si querés: no hay reglas obligatorias.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn onClick={autofill}>Autocompletar con la tabla (1.º vs último)</Btn>
      </div>
      <BracketCanvas
        colW={256}
        gap={28}
        rounds={rounds.map((r) => ({
          key: r,
          title: roundName(r, maxRound),
          items: byRound(r).map((m) => ({
            key: m.ref,
            h: 150,
            feeders: [m.a?.winnerOf, m.a?.loserOf, m.b?.winnerOf, m.b?.loserOf].filter(Boolean),
            node: (
              <div className="flex h-full flex-col justify-between rounded-2xl border border-line bg-surface-2 p-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{label(m)}</span>
                  <button type="button" onClick={() => removeMatch(m.ref)} aria-label="Quitar partido"><Trash2 size={14} className="text-danger" /></button>
                </div>
                {sideSelect(m, 'a')}
                <p className="text-center text-[10px] font-bold text-muted">VS</p>
                {sideSelect(m, 'b')}
              </div>
            ),
          })),
        }))}
        footer={(r) => (
          <button type="button" onClick={() => addMatch(r.key)} className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-line py-2 text-xs font-bold text-muted">
            <Plus size={14} /> Partido
          </button>
        )}
        after={(
          <button type="button" onClick={addRound} className="flex w-24 flex-col items-center gap-1 rounded-xl border border-dashed border-line py-3 text-xs font-bold text-muted">
            <Plus size={14} /> Ronda
          </button>
        )}
      />      <div className="grid grid-cols-2 gap-2">
        <Btn tone="accent" disabled={busy || !matches.length} onClick={save}>{create ? 'Crear llave' : 'Guardar cruces'}</Btn>
        <Btn disabled={busy} onClick={onCancel}>Cancelar</Btn>
      </div>
    </div>
  )
}