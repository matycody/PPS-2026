export default function TeamBadge({ team, size = 'md' }) {
  const dim = size === 'lg' ? 'h-16 w-16 text-xl' : 'h-10 w-10 text-sm'
  if (team?.logo) {
    return <img src={team.logo} alt="" className={dim + ' rounded-full object-cover'} />
  }
  return (
    <div className={dim + ' grid place-items-center rounded-full bg-surface-2 font-extrabold text-muted'}>
      {(team?.name ?? '?').charAt(0).toUpperCase()}
    </div>
  )
}
