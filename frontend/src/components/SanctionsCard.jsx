import { useEffect, useState } from 'react'
import { api } from '../lib/api'

const TEAM_SIZE = 6
const KIND = {
  WARNING: { label: 'Advertencia', dot: 'bg-warn', text: 'text-warn' },
  YELLOW: { label: 'Amarilla', dot: 'bg-yellow-400', text: 'text-yellow-400' },
  BLUE: { label: 'Azul', dot: 'bg-sky-400', text: 'text-sky-400' },
  RED: { label: 'Roja', dot: 'bg-danger', text: 'text-danger' },
}
const showTime = (t) => (t ? t.replace(/^(\d):/, '0$1:') : '--:--')
const who = (s) => (s.player ? (s.player.number != null ? '#' + s.player.number + ' ' : '') + s.player.name : 'Sin identificar')

function Chip({ kind }) {
  const k = KIND[kind]
  return <span className={'inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase ' + k.text}><span className={'h-2.5 w-2.5 rounded-sm ' + k.dot} />{k.label}</span>
}

// Cuántos juegan hoy: 6 menos quienes cumplen tiempo afuera y los eliminados por advertencias (Foam). La roja no resta: se puede reemplazar.
export function playing(side, tick, items) {
  const out = (tick?.sanctions ?? []).filter((x) => x.side === side).length
  const eliminated = items.filter((x) => x.side === side && x.eliminates).length
  return Math.max(0, TEAM_SIZE - out - eliminated)
}

// Casilla de sancionados + historial. Con `control` (mesa/árbitros) permite cargar y deshacer sanciones.
export default function SanctionsCard({ m, tick, items, control, nameA, nameB, always = false }) {
  const [pick, setPick] = useState(null) // { side, kind }
  const [roster, setRoster] = useState({ A: null, B: null })
  const [playerId, setPlayerId] = useState('')
  const [reason, setReason] = useState('')
  const active = tick?.sanctions ?? []
  const history = items.filter((x) => x.kind === 'RED' || x.kind === 'WARNING' || (x.kind !== 'RED' && x.endedAt))
  const kinds = ['WARNING', 'YELLOW', 'BLUE', 'RED'].filter((k) => k !== 'BLUE' || m.modality === 'CLOTH')

  // El plantel se carga al abrir el selector (solo la rama del partido)
  useEffect(() => {
    if (!pick) return
    const t = pick.side === 'A' ? m.teamA : m.teamB
    if (!t?.id || roster[pick.side]) return
    api('GET', '/teams/' + t.id).then((x) => setRoster((r) => ({ ...r, [pick.side]: (x.roster ?? []).filter((p) => p.branch === m.branch) }))).catch(() => setRoster((r) => ({ ...r, [pick.side]: [] })))
  }, [pick]) // eslint-disable-line react-hooks/exhaustive-deps

  const nothing = active.length === 0 && history.length === 0
  if (nothing && !control && !always) return null

  const open = (side, kind) => { setPick({ side, kind }); setPlayerId(''); setReason('') }
  const confirm = () => {
    control.send('match:sanction:add', { side: pick.side, kind: pick.kind, profileId: playerId || undefined, reason: reason.trim() || undefined })
    setPick(null)
  }
  const names = { A: nameA ?? m.teamA?.name ?? 'Equipo A', B: nameB ?? m.teamB?.name ?? 'Equipo B' }
  const list = pick ? (roster[pick.side] ?? null) : null
  const needPlayer = pick?.kind === 'WARNING'

  return (
    <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-muted">Sanciones</p>

      <div className="grid grid-cols-2 gap-2 text-center">
        {['A', 'B'].map((side) => (
          <div key={side} className="rounded-2xl bg-surface-2 p-2">
            <p className="truncate text-xs font-bold">{names[side]}</p>
            <p className={'font-mono text-lg font-extrabold ' + (playing(side, tick, items) < TEAM_SIZE ? 'text-warn' : 'text-muted')}>
              Juega con {playing(side, tick, items)}
            </p>
          </div>
        ))}
      </div>

      {active.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Casilla de sancionados</p>
          {active.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <Chip kind={s.kind} />
              <span className="min-w-0 flex-1 truncate font-semibold">{s.label} <span className="font-normal text-muted">· {names[s.side]}</span></span>
              <span className="font-mono font-extrabold tabular-nums">{showTime(s.time)}{s.kind === 'BLUE' ? <span className="ml-1 text-[10px] font-bold text-muted">/{s.setsLeft} set{s.setsLeft === 1 ? '' : 's'}</span> : null}</span>
              {control && <button onClick={() => control.send('match:sanction:remove', { sanctionId: s.id })} className="text-xs font-bold text-danger" aria-label="Deshacer">✕</button>}
            </div>
          ))}
          <p className="text-[11px] text-muted">El tiempo corre solo mientras corre el partido.</p>
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Registro</p>
          {history.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs">
              <Chip kind={s.kind} />
              <span className="min-w-0 flex-1 truncate">
                <b>{who(s)}</b> <span className="text-muted">· {names[s.side]}</span>
                {s.eliminates && <b className="ml-1 text-danger">· Eliminado</b>}
                {s.kind === 'RED' && <b className="ml-1 text-danger">· Expulsado</b>}
                {s.reason && <span className="text-muted"> · {s.reason}</span>}
              </span>
              {control && s.kind !== 'YELLOW' && s.kind !== 'BLUE' && <button onClick={() => control.send('match:sanction:remove', { sanctionId: s.id })} className="font-bold text-danger" aria-label="Deshacer">✕</button>}
            </div>
          ))}
        </div>
      )}

      {control && (
        <div className="space-y-2">
          {['A', 'B'].map((side) => (
            <div key={side}>
              <p className="mb-1 truncate text-xs font-bold text-muted">{names[side]}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {kinds.map((k) => (
                  <button key={k} disabled={!control.can} onClick={() => open(side, k)} className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 py-2.5 text-xs font-extrabold disabled:opacity-40">
                    <span className={'h-2.5 w-2.5 rounded-sm ' + KIND[k].dot} />{KIND[k].label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {m.modality === 'CLOTH' && <p className="text-[11px] text-muted">En Cloth la salida en falso no se sanciona: las 5 pelotas pasan al otro equipo.</p>}
        </div>
      )}

      {pick && (
        <div className="fixed inset-0 z-[100] grid place-items-end bg-black/70 p-3 sm:place-items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm space-y-3 rounded-3xl border border-line bg-surface p-5">
            <p className="text-lg font-extrabold"><Chip kind={pick.kind} /> <span className="block text-sm font-bold text-muted">{names[pick.side]}</span></p>
            {pick.kind === 'RED' && <p className="text-xs text-muted">Expulsión: el jugador no puede volver a jugar. Después la evalúa el departamento de sanciones (puede sumar fechas de suspensión).</p>}
            {pick.kind === 'WARNING' && <p className="text-xs text-muted">{m.modality === 'FOAM' ? 'La 2.ª advertencia del mismo jugador lo elimina y el equipo pasa a jugar con 5.' : 'Advertencia por una acción inapropiada: en Cloth no elimina al jugador.'}</p>}
            <label className="block text-xs font-bold text-muted">Jugador{needPlayer ? '' : ' (opcional)'}
              <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-3 text-sm">
                <option value="">{list === null ? 'Cargando…' : needPlayer ? 'Elegí al jugador' : 'Sin identificar'}</option>
                {(list ?? []).map((p) => <option key={p.profileId} value={p.profileId}>{p.number != null ? '#' + p.number + ' ' : ''}{p.nickname || p.name}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold text-muted">Motivo (opcional)
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ej.: salida en falso, reclamo, juego brusco" className="mt-1 w-full rounded-xl border border-line bg-bg px-3 py-3 text-sm" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setPick(null)} className="rounded-2xl border border-line py-3 font-extrabold">Cancelar</button>
              <button disabled={needPlayer && !playerId} onClick={confirm} className="rounded-2xl bg-accent py-3 font-extrabold text-black disabled:opacity-40">Aplicar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
