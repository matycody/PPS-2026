import { useState } from 'react'
import { BRANCH, MODALITY } from '../lib/format'
import { Btn, inputCls } from './ui'

export const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function MatchForm({ initial, tournaments, teams, onSubmit, label, busy }) {
  const [f, setF] = useState({
    tournamentId: initial?.tournament?.id ?? tournaments[0]?.id ?? '',
    court: initial?.court ?? 1,
    branch: initial?.branch ?? 'MIXED',
    modality: initial?.modality ?? 'FOAM',
    scheduledAt: toLocalInput(initial?.scheduledAt),
    teamAId: initial?.teamA?.id ?? '',
    teamBId: initial?.teamB?.id ?? '',
  })
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))
  const eligible = teams.filter((t) => (t.branches ?? []).includes(f.branch))

  const submit = (e) => {
    e.preventDefault()
    onSubmit({
      tournamentId: f.tournamentId,
      court: Number(f.court),
      branch: f.branch,
      modality: f.modality,
      scheduledAt: f.scheduledAt ? new Date(f.scheduledAt).toISOString() : undefined,
      teamAId: f.teamAId || undefined,
      teamBId: f.teamBId || undefined,
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <select className={inputCls} required value={f.tournamentId} onChange={(e) => set('tournamentId', e.target.value)}>
        <option value="" disabled>Torneo…</option>
        {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <div className="grid grid-cols-3 gap-3">
        <label className="text-xs text-muted">Cancha
          <input type="number" min="1" required className={inputCls} value={f.court} onChange={(e) => set('court', e.target.value)} />
        </label>
        <label className="text-xs text-muted">Rama
          <select className={inputCls} value={f.branch} onChange={(e) => setF((s) => ({ ...s, branch: e.target.value, teamAId: '', teamBId: '' }))}>
            {Object.entries(BRANCH).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">Modalidad
          <select className={inputCls} value={f.modality} onChange={(e) => set('modality', e.target.value)}>
            {Object.entries(MODALITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-xs text-muted">Fecha y hora
        <input type="datetime-local" className={inputCls} value={f.scheduledAt} onChange={(e) => set('scheduledAt', e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        {[['teamAId', 'Equipo A'], ['teamBId', 'Equipo B']].map(([k, l]) => (
          <label key={k} className="text-xs text-muted">{l}
            <select className={inputCls} value={f[k]} onChange={(e) => set(k, e.target.value)}>
              <option value="">Por definir</option>
              {eligible.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        ))}
      </div>
      <Btn type="submit" tone="accent" disabled={busy || !f.tournamentId} className="w-full">{label}</Btn>
    </form>
  )
}
