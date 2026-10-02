import { useEffect, useState } from 'react'

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
  xl: 'h-20 w-20 text-2xl',
}

export default function TeamBadge({ team, size = 'md' }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [team?.logo])
  const dim = SIZES[size] ?? SIZES.md

  if (team?.logo && !broken) {
    return (
      <img
        src={team.logo}
        alt=""
        onError={() => setBroken(true)}
        className={dim + ' shrink-0 rounded-full border border-line bg-surface-2 object-cover'}
      />
    )
  }
  return (
    <div className={dim + ' grid shrink-0 place-items-center rounded-full bg-surface-2 font-extrabold text-muted'}>
      {(team?.name ?? '?').charAt(0).toUpperCase()}
    </div>
  )
}
