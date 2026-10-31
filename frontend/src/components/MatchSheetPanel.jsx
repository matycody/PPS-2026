import { useRef, useState } from 'react'
import { Camera, ChevronDown, ClipboardCheck } from 'lucide-react'
import { api, apiUploadSheet } from '../lib/api'
import { Btn, Alert } from './ui'

const BADGE = {
  OK: ['Leído por DNI', 'text-live'],
  NAME_ONLY: ['Por nombre: revisar', 'text-warn'],
}

// Planilla de juego antes del partido: la mesa saca la foto, la herramienta propone quién juega
// y la mesa confirma. Quien no figura firmado queda en gris en la lista de jugadores (para todos).
export default function MatchSheetPanel({ match, teamA, teamB, onConfirmed }) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState('idle') // idle | reading | review | done
  const [data, setData] = useState(null) // respuesta del servidor
  const [present, setPresent] = useState({}) // profileId -> boolean
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [summary, setSummary] = useState(null)
  const fileRef = useRef(null)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setErr('')
    setPhase('reading')
    try {
      const r = await apiUploadSheet(match.id, file)
      // Por defecto juega quien figura en la planilla (y, si hay firmas, quien firmó); sin lectura, todos y la mesa ajusta
      const init = {}
      const prop = r.proposal
      r.roster.forEach((p) => { init[p.profileId] = prop ? false : true })
      if (prop) {
        prop.sides.forEach((s) => s.rows.forEach((row) => {
          if (row.profileId && row.status !== 'DUPLICATE') init[row.profileId] = prop.signedAny ? row.signed : true
        }))
      }
      setPresent(init)
      setData(r)
      setPhase('review')
    } catch (ex) {
      setErr(ex.message)
      setPhase('idle')
    }
  }

  const confirm = async () => {
    setBusy(true)
    setErr('')
    try {
      const players = data.roster.map((p) => ({ profileId: p.profileId, present: !!present[p.profileId] }))
      const r = await api('POST', '/matches/' + match.id + '/sheet/' + data.sheetId + '/confirm', { players })
      setSummary(r)
      setPhase('done')
      onConfirmed?.()
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setBusy(false)
    }
  }

  const prop = data?.proposal
  const rowOf = (profileId) => {
    for (const s of prop?.sides ?? []) for (const r of s.rows) if (r.profileId === profileId && r.status !== 'DUPLICATE') return r
    return null
  }
  const nPresent = data ? data.roster.filter((p) => present[p.profileId]).length : 0

  return (
    <section className="rounded-3xl border border-line bg-surface">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
        <ClipboardCheck size={18} className="shrink-0 text-muted" />
        <span className="flex-1 text-xs font-bold uppercase tracking-widest text-muted">Planilla de juego</span>
        <ChevronDown size={18} className={'shrink-0 text-muted transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-line p-4">
          {err && <Alert onClose={() => setErr('')}>{err}</Alert>}

          {(phase === 'idle' || phase === 'done') && (
            <>
              {phase === 'done' && summary && (
                <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold">Planilla confirmada: juegan {summary.present} y {summary.absent} no. Los que no juegan se ven en gris en Jugadores.</p>
              )}
              <p className="text-xs text-muted">Sacale una foto a la planilla con los jugadores y firmas. La herramienta propone quién juega y vos confirmás. La foto original queda guardada para la organización.</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} />
              <Btn tone="accent" className="w-full" onClick={() => fileRef.current?.click()}><Camera size={16} /> {phase === 'done' ? 'Cargar otra planilla' : 'Sacar o subir foto'}</Btn>
            </>
          )}

          {phase === 'reading' && <p className="rounded-xl bg-surface-2 px-3 py-4 text-center text-sm font-semibold">Subiendo y leyendo la planilla… puede tardar unos segundos.</p>}

          {phase === 'review' && data && (
            <>
              {data.imageUrl && <a href={data.imageUrl} target="_blank" rel="noreferrer" className="block text-xs font-bold text-accent">Ver la foto original ›</a>}
              {data.aiError && <Alert>No se pudo leer automáticamente ({data.aiError}). La foto quedó guardada: marcá a mano quién juega.</Alert>}
              {prop && !prop.signedAny && <Alert tone="live">La planilla no tiene firmas. Se tomó como presentes a todos los que figuran: revisá.</Alert>}

              {['A', 'B'].map((side) => {
                const team = side === 'A' ? teamA : teamB
                const list = data.roster.filter((p) => p.side === side)
                const extra = (prop?.sides.find((s) => s.side === side)?.rows ?? []).filter((r) => ['UNKNOWN', 'OTHER_TEAM', 'DUPLICATE'].includes(r.status))
                return (
                  <div key={side} className="space-y-1.5">
                    <p className="text-sm font-extrabold">{team?.name ?? 'Equipo ' + side}</p>
                    {list.map((p) => {
                      const row = rowOf(p.profileId)
                      const badge = row ? BADGE[row.status] : null
                      return (
                        <label key={p.profileId} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs">
                          <input type="checkbox" checked={!!present[p.profileId]} onChange={(e) => setPresent((s) => ({ ...s, [p.profileId]: e.target.checked }))} />
                          <span className="w-8 shrink-0 font-mono text-[11px] font-bold text-muted">{p.number != null ? '#' + p.number : ''}</span>
                          <span className="min-w-0 flex-1 font-semibold">
                            {p.name}
                            {p.suspended && <span className="ml-1.5 rounded bg-danger/15 px-1 text-[10px] font-bold text-danger">SUSPENDIDO</span>}
                          </span>
                          <span className="shrink-0 text-right text-[10px] font-bold uppercase">
                            {prop && !row && <span className="text-muted">No figura</span>}
                            {row && !row.signed && prop?.signedAny && <span className="text-warn">Sin firma</span>}
                            {badge && <span className={'block ' + badge[1]}>{badge[0]}</span>}
                          </span>
                        </label>
                      )
                    })}
                    {list.length === 0 && <p className="text-xs text-muted">Sin jugadores cargados en esta rama.</p>}
                    {extra.map((r) => (
                      <p key={side + r.idx} className="rounded-xl border border-warn/50 px-3 py-2 text-xs">
                        <span className="font-bold">{r.name || 'Sin nombre'}</span>{r.dni ? ' · DNI ' + r.dni : ''}
                        <span className="block text-[10px] font-bold uppercase text-warn">
                          {r.status === 'OTHER_TEAM' ? 'Existe en el sistema pero no es de este equipo' : r.status === 'DUPLICATE' ? 'Repetido en la planilla' : 'No figura en el sistema'} · no se cuenta
                        </span>
                      </p>
                    ))}
                  </div>
                )
              })}

              <p className="text-xs font-bold text-muted">Juegan {nPresent} · no juegan {data.roster.length - nPresent}</p>
              <div className="grid grid-cols-2 gap-2">
                <Btn onClick={() => { setPhase('idle'); setData(null) }} disabled={busy}>Descartar</Btn>
                <Btn tone="accent" onClick={confirm} disabled={busy}>{busy ? 'Guardando…' : 'Confirmar planilla'}</Btn>
              </div>
              <p className="text-[11px] text-muted">Al descartar, la foto igual queda guardada para auditoría, pero no cambia quién juega.</p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
