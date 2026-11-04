import { useEffect, useState } from 'react'
import { useTeamLogos } from '../stores/teamLogosStore'

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
  xl: 'h-20 w-20 text-2xl',
}

export default function TeamBadge({ team, size = 'md', branch = null }) {
  const [broken, setBroken] = useState(false)
  const own = useTeamLogos((s) => (branch && team?.id ? s.map[team.id]?.[branch] : null))
  const logo = (branch && team?.branchLogos?.[branch]) || own || team?.logo // escudo de la rama, si tiene; si no, el general
  useEffect(() => setBroken(false), [logo])
  const dim = SIZES[size] ?? SIZES.md

  if (logo && !broken) {
    // El escudo se muestra completo (sin recortar): contenido dentro del círculo con un margen para que entren las esquinas
    return (
      <div className={dim + ' relative shrink-0 overflow-hidden rounded-full border border-line bg-surface-2'}>
        <img src={logo} alt="" onError={() => setBroken(true)} className="absolute inset-[10%] h-[80%] w-[80%] object-contain" />
      </div>
    )
  }
  return (
    <div className={dim + ' grid shrink-0 place-items-center rounded-full bg-surface-2 font-extrabold text-muted'}>
      {(team?.name ?? '?').charAt(0).toUpperCase()}
    </div>
  )
}
