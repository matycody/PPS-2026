import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { PENALTY_KIND, penaltyWhy } from '../../lib/format'
import { Btn, inputCls } from '../ui'
import { useConfirm } from '../ConfirmProvider'

// Quita de puntos a un equipo (no presentó árbitros de línea o mesa): 1 punto por cada persona faltante, en la tabla de la zona elegida
export default function PenaltiesPanel({ t, setErr, onChange }) {
  const [data, setData] = useState(null)
  const [stageId, setStageId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [kind, setKind] = useState('STAFF')
  const [miss, setMiss] = useState({ l1: false, l2: false, mesa: false })
  const [extra, setExtra] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const ask = useConfirm()
  const closed = t.status === 'FINISHED'
  const load = useCallback(() => api('GET', '/tournaments/' + t.id + '/standings').then((d) => { setData(d.stages); setStageId((cur) => cur || d.stages[0]?.id || '') }).catch((e) => setErr(e.message)), [t.id, setErr])
  useEffect(() => { load() }, [load])
  const stage = (data ?? []).find((s) => s.id === stageId)
  const staff = kind === 'STAFF'
  const picked = staff ? [miss.l1 && 'LINE', miss.l2 && 'LINE', miss.mesa && 'TABLE'].filter(Boolean) : []
  const pts = picked.length || Number(extra) || 0

  async function add() {
    setBusy(true)
    try {
      await api('POST', '/tournaments/' + t.id + '/stages/' + stageId + '/penalties', staff ? { teamId, kind, missing: picked, reason } : { teamId, kind, points: Number(extra), reason })
      setMiss({ l1: false, l2: false, mesa: false }); setExtra(''); setReason('')
      await load(); onChange?.()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  async function remove(x) {
    if (!(await ask({ title: 'Quitar la sanción', message: 'Se devuelven ' + x.points + ' punto(s) al equipo.', confirmText: 'Quitar', danger: true }))) return
    try { await api('DELETE', '/tournaments/' + t.id + '/stages/' + stageId + '/penalties/' + x.id); await load(); onChange?.() } catch (e) { setErr(e.message) }
  }

  if (!data) return null
  if (!data.length) return null
  const chk = (k, label) => (
    <label key={k} className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm font-bold">
      <input type="checkbox" checked={miss[k]} onChange={(e) => setMiss({ ...miss, [k]: e.target.checked })} /> {label}
    </label>
  )
  return (
    <div className="space-y-3 rounded-3xl border border-line bg-surface p-4">
      <div>
        <h3 className="text-sm font-extrabold">Sanción a un equipo · quita de puntos</h3>
        <p className="text-xs text-muted">Se descuenta en la tabla de la rama y categoría de la zona elegida. Si faltan árbitros o mesa (cada equipo presenta 2 de línea y 1 de mesa) son 1 punto por persona; en los demás motivos ponés vos los puntos.</p>
      </div>
      {closed && <p className="text-xs font-bold text-warn">El torneo está cerrado: reabrilo para cargar o quitar sanciones.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <select className={inputCls} value={stageId} onChange={(e) => { setStageId(e.target.value); setTeamId('') }}>
          {data.map((s) => <option key={s.id} value={s.id}>{s.name}{s.tier ? ' · Cat. ' + String.fromCharCode(64 + s.tier) : ''}</option>)}
        </select>
        <select className={inputCls} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Equipo…</option>
          {(stage?.rows ?? []).map((r) => <option key={r.team.id} value={r.team.id}>{r.team.name}</option>)}
        </select>
      </div>
      <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>
        {Object.entries(PENALTY_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      {staff
        ? <div className="grid gap-2 sm:grid-cols-3">{chk('l1', 'Falta árbitro de línea 1')}{chk('l2', 'Falta árbitro de línea 2')}{chk('mesa', 'Falta mesa')}</div>
        : <input className={inputCls} type="number" min="1" max="20" placeholder="Puntos a quitar" value={extra} onChange={(e) => setExtra(e.target.value)} />}
      <input className={inputCls} maxLength={200} placeholder="Detalle (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Btn onClick={add} disabled={busy || closed || !teamId || pts < 1}>{pts > 0 ? 'Quitar ' + pts + ' punto' + (pts === 1 ? '' : 's') : 'Quitar puntos'}</Btn>
      {(stage?.penalties ?? []).length > 0 && (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {stage.penalties.map((x) => {
            const nm = stage.rows.find((r) => r.team.id === x.teamId)?.team.name ?? 'Equipo'
            const why = penaltyWhy(x)
            return (
              <li key={x.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span><b className="text-danger">−{x.points}</b> {nm}{why ? ' · ' + why : ''}{x.reason && (x.kind === 'STAFF' || x.missing?.length) ? ' · ' + x.reason : ''}</span>
                {!closed && <button onClick={() => remove(x)} aria-label="Quitar sanción" className="text-muted"><Trash2 size={16} /></button>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

