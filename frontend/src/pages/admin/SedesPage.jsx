import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, MapPin, X, Navigation } from 'lucide-react'
import { api } from '../../lib/api'
import { Btn, Alert, inputCls } from '../../components/ui'
import { useConfirm } from '../../components/ConfirmProvider'
import { mapLinks } from '../../lib/maps'

const EMPTY = { name: '', address: '', latitude: '', longitude: '', mapUrl: '', courts: '', notes: '' }

// Acepta "-34.6037, -58.3816" pegado en un solo campo (como lo copia Google Maps)
function parseCoords(text) {
  const m = String(text).match(/(-?\d{1,3}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)/)
  return m ? { latitude: m[1], longitude: m[2] } : null
}

export default function SedesPage() {
  const ask = useConfirm()
  const [list, setList] = useState(null)
  const [form, setForm] = useState(null) // null = cerrado; { id?, ...campos }
  const [coords, setCoords] = useState('')
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [readMsg, setReadMsg] = useState('')

  const load = () => api('GET', '/venues').then(setList).catch((e) => setErr(e.message))
  useEffect(() => { load() }, [])

  const open = (v) => {
    setErr(''); setOk('')
    if (v) {
      setForm({ id: v.id, name: v.name, address: v.address, latitude: v.latitude ?? '', longitude: v.longitude ?? '', mapUrl: v.mapUrl ?? '', courts: v.courts ?? '', notes: v.notes ?? '' })
      setCoords(v.latitude != null ? v.latitude + ', ' + v.longitude : '')
    } else { setForm({ ...EMPTY }); setCoords('') }
  }
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const onCoords = (text) => {
    setCoords(text)
    const c = parseCoords(text)
    setForm((f) => ({ ...f, latitude: c ? c.latitude : '', longitude: c ? c.longitude : '' }))
  }

  // Pegás el enlace de Google Maps y se completa el formulario (después se puede corregir a mano)
  async function readLink(url) {
    const link = (url ?? form.mapUrl).trim()
    if (!/^https?:\/\//i.test(link)) return
    setReading(true); setErr(''); setReadMsg('')
    try {
      const r = await api('POST', '/venues/resolve', { url: link })
      setForm((f) => ({
        ...f,
        mapUrl: r.mapUrl,
        name: r.name ?? f.name,
        address: r.address ?? f.address,
        latitude: r.latitude ?? f.latitude,
        longitude: r.longitude ?? f.longitude,
      }))
      if (r.latitude != null) setCoords(r.latitude + ', ' + r.longitude)
      setReadMsg(r.found ? 'Completé lo que pude leer del enlace. Revisá nombre y dirección y corregí lo que haga falta.' : 'El enlace es válido pero no trae datos del lugar: completá nombre y dirección a mano.')
    } catch (e) { setErr(e.message) } finally { setReading(false) }
  }

  async function save(e) {
    e.preventDefault()
    if (coords.trim() && !parseCoords(coords)) return setErr('Las coordenadas deben ser como: -34.6037, -58.3816')
    setBusy(true); setErr('')
    const body = {
      name: form.name.trim(), address: form.address.trim(),
      latitude: form.latitude === '' ? null : Number(form.latitude), longitude: form.longitude === '' ? null : Number(form.longitude),
      mapUrl: form.mapUrl.trim() || null, courts: form.courts === '' ? null : Number(form.courts), notes: form.notes.trim() || null,
    }
    try {
      if (form.id) await api('PATCH', '/venues/' + form.id, body)
      else await api('POST', '/venues', body)
      setOk(form.id ? 'Sede actualizada' : 'Sede creada')
      setForm(null)
      await load()
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  async function remove(v) {
    const used = v.matchCount ? ' Los ' + v.matchCount + ' partidos que la usan conservan su sede.' : ''
    if (!(await ask({ title: 'Eliminar sede', message: '¿Eliminar "' + v.name + '"?' + used, confirmText: 'Eliminar', danger: true }))) return
    setErr('')
    try { await api('DELETE', '/venues/' + v.id); setOk('Sede eliminada'); await load() } catch (e) { setErr(e.message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xs font-bold uppercase tracking-widest text-muted">Sedes</h1>
        {!form && <Btn tone="accent" onClick={() => open(null)}><Plus size={16} /> Nueva sede</Btn>}
      </div>
      <div className="text-xs text-muted">Los polideportivos donde se juegan las fechas. Se eligen al armar la jornada y la gente ve cómo llegar desde el partido.</div>
      {err && <Alert onClose={() => setErr('')}>{err}</Alert>}
      {ok && <Alert tone="ok" onClose={() => setOk('')}>{ok}</Alert>}

      {form && (
        <form onSubmit={save} className="space-y-3 rounded-3xl border border-line bg-surface p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">{form.id ? 'Editar sede' : 'Nueva sede'}</span>
            <button type="button" aria-label="Cerrar" onClick={() => setForm(null)} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted"><X size={16} /></button>
          </div>
          <div className="space-y-1.5 rounded-2xl bg-surface-2 p-3">
            <label className="block text-xs font-bold text-muted">Pegá el enlace de Google Maps y se completa solo
              <input className={inputCls} type="url" maxLength={300} placeholder="https://maps.app.goo.gl/…" value={form.mapUrl}
                onChange={(e) => set('mapUrl', e.target.value)}
                onPaste={(e) => { const t = e.clipboardData.getData('text'); if (/^https?:\/\//i.test(t.trim())) { e.preventDefault(); set('mapUrl', t.trim()); readLink(t) } }} />
            </label>
            <Btn type="button" disabled={reading || !/^https?:\/\//i.test(form.mapUrl.trim())} onClick={() => readLink()}>{reading ? 'Leyendo…' : 'Completar con el enlace'}</Btn>
            {readMsg && <div className="text-xs text-muted">{readMsg}</div>}
            <div className="text-xs text-muted">En Google Maps: abrí el lugar › Compartir › Copiar enlace.</div>
          </div>
          <label className="block text-xs text-muted">Nombre
            <input className={inputCls} required maxLength={80} placeholder="Ej.: Polideportivo Municipal" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </label>
          <label className="block text-xs text-muted">Dirección
            <input className={inputCls} required maxLength={160} placeholder="Calle, número, localidad" value={form.address} onChange={(e) => set('address', e.target.value)} />
          </label>
          <label className="block text-xs text-muted">Coordenadas (opcional, para el punto exacto)
            <input className={inputCls} placeholder="-34.6037, -58.3816" value={coords} onChange={(e) => onCoords(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
            <label className="text-xs text-muted">Canchas habituales
              <input className={inputCls} type="number" min="1" max="50" placeholder="Opcional" value={form.courts} onChange={(e) => set('courts', e.target.value)} />
            </label>
          </div>
          <label className="block text-xs text-muted">Nota para la gente (opcional)
            <textarea className={inputCls} rows={2} maxLength={300} placeholder="Ej.: entrada por calle X, hay estacionamiento" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>
          <div className="flex gap-2">
            <Btn className="flex-1" type="button" disabled={busy} onClick={() => setForm(null)}>Cancelar</Btn>
            <Btn className="flex-1" tone="accent" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar sede'}</Btn>
          </div>
        </form>
      )}

      {list === null && <div className="text-muted">Cargando…</div>}
      {list?.length === 0 && !form && <div className="rounded-2xl border border-line bg-surface p-6 text-center text-muted">Todavía no hay sedes. Cargá la primera con “Nueva sede”.</div>}
      <div className="space-y-2">
        {(list ?? []).map((v) => {
          const links = mapLinks(v)
          return (
            <div key={v.id} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent"><MapPin size={18} /></div>
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold leading-tight">{v.name}</div>
                  <div className="text-sm text-muted">{v.address}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold">
                    {v.courts && <span className="rounded-full border border-line px-2 py-0.5">{v.courts} {v.courts === 1 ? 'cancha' : 'canchas'}</span>}
                    <span className="rounded-full border border-line px-2 py-0.5">{v.matchCount} {v.matchCount === 1 ? 'partido' : 'partidos'}</span>
                    {v.latitude == null && !v.mapUrl && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-warn">Sin punto exacto</span>}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <a href={links.google} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5"><Navigation size={14} /> Probar mapa</a>
                <span className="flex-1" />
                <button aria-label="Editar" onClick={() => open(v)} className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-muted"><Pencil size={16} /></button>
                <button aria-label="Eliminar" onClick={() => remove(v)} className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-danger"><Trash2 size={16} /></button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
