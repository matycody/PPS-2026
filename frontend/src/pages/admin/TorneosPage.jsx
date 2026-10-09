import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Pencil, Trash2, ChevronUp, ChevronDown, ChevronRight, Trophy } from 'lucide-react'
import { api } from '../../lib/api'
import { BRANCH, MODALITY, FORMAT, TSTATUS, CRITERIA, fmtDate } from '../../lib/format'
import { Btn, Alert, inputCls } from '../../components/ui'
import { useConfirm } from '../../components/ConfirmProvider'

const NOW_YEAR = new Date().getFullYear()
const EMPTY = {
  name: '', year: NOW_YEAR, edition: '', branch: 'MIXED', modality: 'FOAM', format: 'LEAGUE',
  startsAt: '', endsAt: '', pointsWin: 3, pointsDraw: 1, pointsLoss: 0,
}
// Mediodía UTC para que la fecha no se corra por zona horaria
const toIso = (d) => (d ? d + 'T12:00:00.000Z' : undefined)

function Field({ label, children }) {
  return <label className="block min-w-0 text-xs text-muted">{label}{children}</label>
}

export default function TorneosPage() {
  const ask = useConfirm()
  const nav = useNavigate()
  const [list, setList] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [tb, setTb] = useState(null) // null = desempates por defecto del backend
  const [editId, setEditId] = useState(null)
  const [yearFilter, setYearFilter] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const load = () => api('GET', '/tournaments?limit=200' + (yearFilter ? '&year=' + yearFilter : ''))
    .then(setList).catch((e) => setErr(e.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [yearFilter])

  function move(i, d) {
    setTb((a) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j], b[i]]; return b })
  }
  const toggleCriterion = (c) => setTb((a) => (a.includes(c) ? a.filter((x) => x !== c) : [...a, c]))

  async function save(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      if (editId) {
        await api('PATCH', '/tournaments/' + editId, { name: form.name.trim(), startsAt: toIso(form.startsAt) ?? null, endsAt: toIso(form.endsAt) ?? null })
        setForm(EMPTY); setEditId(null); await load()
      } else {
        const body = {
          name: form.name.trim(), year: Number(form.year), edition: form.edition.trim() || undefined,
          branch: form.branch, modality: form.modality, format: form.format,
          startsAt: toIso(form.startsAt), endsAt: toIso(form.endsAt),
          pointsWin: Number(form.pointsWin), pointsDraw: Number(form.pointsDraw), pointsLoss: Number(form.pointsLoss),
          ...(tb ? { tiebreakers: tb } : {}),
        }
        const t = await api('POST', '/tournaments', body)
        nav('/admin/torneos/' + t.id)
      }
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  async function remove(t) {
    if (!(await ask({ title: 'Eliminar torneo', message: '¿Eliminar "' + t.name + '"?', confirmText: 'Eliminar', danger: true }))) return
    setErr('')
    try { await api('DELETE', '/tournaments/' + t.id); await load() } catch (e) { setErr(e.message) }
  }

  function edit(t) {
    setEditId(t.id)
    setForm({ ...EMPTY, name: t.name, startsAt: t.startsAt?.slice(0, 10) ?? '', endsAt: t.endsAt?.slice(0, 10) ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Torneos</h1>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}

      <form onSubmit={save} className="space-y-3 rounded-3xl border border-line bg-surface p-5">
        <p className="text-sm font-bold">{editId ? 'Editar torneo (nombre y fechas)' : 'Nuevo torneo'}</p>
        <input className={inputCls} placeholder="Nombre" required value={form.name} onChange={(e) => set('name', e.target.value)} />
        {!editId && (
          <>
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <Field label="Año"><input type="number" className={inputCls} required value={form.year} onChange={(e) => set('year', e.target.value)} /></Field>
              <Field label="Edición (opcional)"><input className={inputCls} placeholder="Apertura, 2.ª…" value={form.edition} onChange={(e) => set('edition', e.target.value)} /></Field>
              <Field label="Rama">
                <select className={inputCls} value={form.branch} onChange={(e) => set('branch', e.target.value)}>
                  {Object.entries(BRANCH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Modalidad">
                <select className={inputCls} value={form.modality} onChange={(e) => set('modality', e.target.value)}>
                  {Object.entries(MODALITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Formato">
              <select className={inputCls} value={form.format} onChange={(e) => set('format', e.target.value)}>
                {Object.entries(FORMAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </>
        )}
        <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
          <Field label="Inicio"><input type="date" className={inputCls} value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></Field>
          <Field label="Fin"><input type="date" className={inputCls} value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></Field>
        </div>
        {!editId && (
          <>
            <div className="grid grid-cols-3 gap-3 [&>*]:min-w-0">
              <Field label="Pts victoria"><input type="number" min="0" className={inputCls} value={form.pointsWin} onChange={(e) => set('pointsWin', e.target.value)} /></Field>
              <Field label="Pts empate"><input type="number" min="0" className={inputCls} value={form.pointsDraw} onChange={(e) => set('pointsDraw', e.target.value)} /></Field>
              <Field label="Pts derrota"><input type="number" min="0" className={inputCls} value={form.pointsLoss} onChange={(e) => set('pointsLoss', e.target.value)} /></Field>
            </div>
            <div className="space-y-2 rounded-2xl bg-surface-2 p-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={tb !== null} onChange={(e) => setTb(e.target.checked ? ['HEAD_TO_HEAD', 'SET_DIFFERENCE', 'SETS_WON', 'DRAW_LOT'] : null)} />
                Personalizar criterios de desempate
              </label>
              {tb && (
                <div className="space-y-1">
                  <p className="text-xs text-muted">Se aplican en este orden cuando hay igualdad de puntos.</p>
                  {tb.map((c, i) => (
                    <div key={c} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm">
                      <span className="w-5 font-bold text-muted">{i + 1}</span>
                      <span className="flex-1">{CRITERIA[c]}</span>
                      <button type="button" aria-label="Subir" onClick={() => move(i, -1)}><ChevronUp size={18} /></button>
                      <button type="button" aria-label="Bajar" onClick={() => move(i, 1)}><ChevronDown size={18} /></button>
                      <button type="button" aria-label="Quitar" onClick={() => toggleCriterion(c)}><Trash2 size={16} className="text-danger" /></button>
                    </div>
                  ))}
                  {Object.keys(CRITERIA).filter((c) => !tb.includes(c)).map((c) => (
                    <button key={c} type="button" onClick={() => toggleCriterion(c)} className="mr-2 rounded-full border border-line px-3 py-1 text-xs">+ {CRITERIA[c]}</button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        <div className="flex gap-2">
          <Btn type="submit" tone="accent" disabled={busy} className="flex-1">{editId ? 'Guardar' : 'Crear torneo'}</Btn>
          {editId && <Btn onClick={() => { setEditId(null); setForm(EMPTY) }}>Cancelar</Btn>}
        </div>
      </form>

      <label className="block text-xs text-muted">Filtrar por año
        <input type="number" className={inputCls} placeholder="Todos" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} />
      </label>

      {list === null && <p className="text-muted">Cargando…</p>}
      {list?.length === 0 && <p className="text-muted">No hay torneos.</p>}
      <div className="space-y-2">
        {(list ?? []).map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
            <Link to={'/admin/torneos/' + t.id} className="min-w-0 flex-1">
              <p className="truncate font-bold">{t.name}{t.edition ? ' · ' + t.edition : ''}</p>
              <p className="text-sm text-muted">
                {t.year} · {FORMAT[t.format]} · {BRANCH[t.branch]} · {MODALITY[t.modality]} · {t._count?.teams ?? 0} equipos
              </p>
              <p className="flex items-center gap-2 text-xs text-muted">
                <span className={'rounded-full px-2 py-0.5 font-bold uppercase ' + TSTATUS[t.status].cls}>{TSTATUS[t.status].label}</span>
                {t.champion && <span className="flex items-center gap-1"><Trophy size={12} /> {t.champion.name}</span>}
                <span>{fmtDate(t.startsAt)} → {fmtDate(t.endsAt)}</span>
              </p>
            </Link>
            <button aria-label="Editar" onClick={() => edit(t)}><Pencil size={18} className="text-muted" /></button>
            <button aria-label="Eliminar" onClick={() => remove(t)}><Trash2 size={18} className="text-danger" /></button>
            <Link to={'/admin/torneos/' + t.id} aria-label="Abrir"><ChevronRight size={18} className="text-muted" /></Link>
          </div>
        ))}
      </div>
    </div>
  )
}
