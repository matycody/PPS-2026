import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BRANCH } from '../lib/format'
import PersonName from './PersonName'
import { suspensionText } from './SuspensionNotice'

const ORDER = ['MALE', 'MIXED', 'FEMALE']

// Plantel masculino, mixto y femenino. En cada uno, la persona logueada aparece primero.
export default function Roster({ roster = [], meProfileId, extra }) {
  const count = (b) => roster.filter((r) => r.branch === b).length
  const mine = roster.find((r) => r.profileId === meProfileId)?.branch
  const [sel, setSel] = useState(null)
  // Por defecto: la rama de la persona logueada, si no la primera con jugadores
  const current = sel ?? mine ?? ORDER.find((b) => count(b) > 0) ?? ORDER[0]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {ORDER.map((branch) => (
          <button
            key={branch}
            role="tab"
            aria-selected={current === branch}
            onClick={() => setSel(branch)}
            className={'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold ' + (current === branch ? 'border-accent bg-accent text-black' : 'border-line bg-surface text-muted')}
          >
            {BRANCH[branch]}
            <span className={'rounded-full px-1.5 text-xs font-extrabold ' + (current === branch ? 'bg-black/15' : 'bg-surface-2')}>{count(branch)}</span>
          </button>
        ))}
      </div>
      {ORDER.filter((branch) => branch === current).map((branch) => {
        const list = roster
          .filter((r) => r.branch === branch)
          .sort(
            (a, b) =>
              Number(!!b.coach) - Number(!!a.coach) ||
              Number(b.profileId === meProfileId) - Number(a.profileId === meProfileId) ||
              (a.nickname?.trim() || a.name).localeCompare(b.nickname?.trim() || b.name, 'es')
          )
        return (
          <div key={branch} className="space-y-2">
            {list.length === 0 && <p className="text-sm text-muted">Sin jugadores.</p>}
            {list.map((r) => {
              const me = !!meProfileId && r.profileId === meProfileId
              return (
                <div
                  key={r.profileId + r.branch}
                  className={'flex items-center gap-3 rounded-xl px-3 py-2 text-sm ' + (me ? 'bg-accent text-black' : 'bg-surface-2')}
                >
                  <div className={'grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-extrabold ' + (me ? 'bg-black/20 text-black' : 'bg-surface text-muted')}>
                    {(r.nickname?.trim() || r.name).charAt(0).toUpperCase()}
                  </div>
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    <Link to={'/jugador/' + r.profileId}><PersonName p={r} className={me ? '[&_span]:!text-black/60' : ''} /></Link>
                    {r.coach && <span className={'ml-1.5 text-xs font-bold ' + (me ? 'text-black/70' : 'text-accent')}>(DT)</span>}
                    {r.suspension && <span className="ml-1.5 rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-danger">Suspendido · {suspensionText(r.suspension)}</span>}
                  </span>
                  {me && <span className="rounded-full bg-black px-2 py-0.5 text-[10px] font-bold uppercase text-accent">Vos</span>}
                  {extra?.(r)}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
