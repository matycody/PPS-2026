import { BRANCH } from '../lib/format'
import PersonName from './PersonName'

const ORDER = ['MALE', 'MIXED', 'FEMALE']

// Plantel masculino, mixto y femenino. En cada uno, la persona logueada aparece primero.
export default function Roster({ roster = [], meProfileId, extra }) {
  return (
    <div className="space-y-5">
      {ORDER.map((branch) => {
        const list = roster
          .filter((r) => r.branch === branch)
          .sort(
            (a, b) =>
              Number(b.profileId === meProfileId) - Number(a.profileId === meProfileId) ||
              (a.nickname?.trim() || a.name).localeCompare(b.nickname?.trim() || b.name, 'es')
          )
        return (
          <div key={branch} className="space-y-2">
            <p className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted">
              <span>Plantel {BRANCH[branch].toLowerCase()}</span>
              <span>{list.length}</span>
            </p>
            {list.length === 0 && <p className="text-sm text-muted">Sin jugadores.</p>}
            {list.map((r) => {
              const me = !!meProfileId && r.profileId === meProfileId
              return (
                <div
                  key={r.profileId + r.branch}
                  className={'flex items-center gap-3 rounded-xl px-3 py-2 text-sm ' + (me ? 'border border-accent/50 bg-accent-soft' : 'bg-surface-2')}
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-sm font-extrabold text-muted">
                    {(r.nickname?.trim() || r.name).charAt(0).toUpperCase()}
                  </div>
                  <PersonName p={r} className="min-w-0 flex-1 truncate font-semibold" />
                  {me && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-black">Vos</span>}
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
